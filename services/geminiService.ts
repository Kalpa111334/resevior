import { GoogleGenAI } from "@google/genai";
import { Coordinates } from "../types";

const apiKey = process.env.API_KEY || ''; // Injected by environment

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey });

/**
 * Uses Gemini with Google Maps Grounding to identify the reservoir at the given coordinates
 * and verify if the user is near a known water body in Sri Lanka.
 */
export const verifyLocationAndFetchDetails = async (coords: Coordinates): Promise<{
  name: string;
  description: string;
  isValidReservoir: boolean;
  mapLink?: string;
}> => {
  try {
    const modelId = "gemini-2.5-flash"; // Required for tools support

    // Strict prompt for Geofencing - Emphasizing Accuracy
    const prompt = `
      I am a Data Entry Worker for the National Water Board of Sri Lanka.
      My current GPS location is Latitude: ${coords.latitude}, Longitude: ${coords.longitude}.
      
      TASK:
      1. Use Google Maps to identify if I am STRICTLY located at or near a major Reservoir, Tank (Wewa), Lake, or Dam in Sri Lanka.
      2. If I am at a valid water body, provide its OFFICIAL English name.
      3. If I am NOT near a water body (e.g., inside a city, house, or forest far from the bund), declare the location INVALID.
      
      OUTPUT FORMAT:
      NAME: [Official Name of Reservoir/Tank or "Unknown"]
      VERDICT: [VALID or INVALID]
      DESCRIPTION: [A concise, factual sentence verifying the specific location.]
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: coords.latitude,
              longitude: coords.longitude
            }
          }
        } as any 
      },
    });

    const text = response.text || "Location analysis unavailable.";
    
    // Extract grounding chunks for the map link
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    let mapLink = "";
    
    if (groundingChunks) {
      // Look for maps specific URI in grounding chunks
      for (const chunk of groundingChunks) {
        if (chunk.maps?.uri) {
          mapLink = chunk.maps.uri;
          break;
        }
        if (chunk.web?.uri && chunk.web.uri.includes('google.com/maps')) {
          mapLink = chunk.web.uri;
          break;
        }
      }
    }

    // Parse the structured text response
    const nameMatch = text.match(/NAME:\s*(.*)/i);
    const verdictMatch = text.match(/VERDICT:\s*(.*)/i);
    const descMatch = text.match(/DESCRIPTION:\s*(.*)/i);

    let locationName = nameMatch ? nameMatch[1].trim() : "Unknown Location";
    const isValidReservoir = verdictMatch ? verdictMatch[1].trim().toUpperCase().includes("VALID") : false;
    const description = descMatch ? descMatch[1].trim() : text;

    // Fallback name extraction if regex fails but grounding title exists
    if ((!nameMatch || locationName === "Unknown" || locationName === "") && groundingChunks) {
       const titleChunk = groundingChunks.find((c: any) => c.maps?.title || c.web?.title);
       if (titleChunk) {
         locationName = titleChunk.maps?.title || titleChunk.web?.title;
       }
    }

    return {
      name: locationName,
      description: description,
      isValidReservoir,
      mapLink
    };

  } catch (error) {
    console.error("Gemini Location Verification Error:", error);
    return {
      name: "Manual Location (Error)",
      description: "Could not verify location with AI services. Please check network.",
      isValidReservoir: false
    };
  }
};

/**
 * Generate a brief status report based on water level data.
 */
export const generateRiskAnalysis = async (entry: {name: string, level: number, capacity: number}) => {
   try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `The ${entry.name} in Sri Lanka is currently at ${entry.level}m water level, which is ${entry.capacity}% of its capacity. 
      Provide a one-sentence risk assessment (Low/Medium/High risk of flooding or drought) and a recommendation for irrigation management.`,
    });
    return response.text;
   } catch (e) {
     return "Analysis unavailable.";
   }
};

/**
 * Uses Gemini Vision to verify if an image contains a live human face for authentication.
 * Acts as a strict biometric filter.
 */
export const analyzeFaceForAccess = async (base64Image: string): Promise<{ authorized: boolean; reason: string }> => {
  try {
     const modelId = "gemini-2.5-flash";
     
     // Remove header if present to get pure base64
     const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

     const response = await ai.models.generateContent({
        model: modelId,
        contents: {
            parts: [
                { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } },
                { text: `
                  Analyze this image for high-security biometric authentication. 
                  
                  CRITERIA:
                  1. Must contain EXACTLY ONE human face.
                  2. Face must be clear, well-lit, and facing the camera (frontal view).
                  3. Must appear to be a LIVE person (check for signs of spoofing like holding a phone screen or printed photo).
                  
                  Respond in JSON format:
                  {
                    "authorized": boolean, // true ONLY if all criteria are met
                    "reason": string // Brief explanation of the verdict
                  }
                ` }
            ]
        },
        config: { 
            responseMimeType: "application/json" 
        }
     });
     
     const result = JSON.parse(response.text || '{"authorized": false, "reason": "No response from AI"}');
     return result;

  } catch (e) {
      console.error("Face Analysis Error:", e);
      return { authorized: false, reason: "Biometric Service Unavailable. Check connection." };
  }
};