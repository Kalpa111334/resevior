import React, { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Coordinates, ReservoirEntry, ReservoirStatus, User } from '../types';
import { verifyLocationAndFetchDetails, generateRiskAnalysis } from '../services/geminiService';

interface DataEntryFormProps {
  user: User;
  onSubmit: (entry: ReservoirEntry) => void;
}

export const DataEntryForm: React.FC<DataEntryFormProps> = ({ user, onSubmit }) => {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationAnalysis, setLocationAnalysis] = useState('');
  const [locationVerified, setLocationVerified] = useState(false);
  const [mapLink, setMapLink] = useState<string | undefined>();
  const [isVerifying, setIsVerifying] = useState(false);

  // Form State
  const [waterLevel, setWaterLevel] = useState<number | ''>('');
  const [capacity, setCapacity] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ReservoirStatus>(ReservoirStatus.NORMAL);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsLocating(true);
    setLocationVerified(false);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const c = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setCoords(c);
        setIsLocating(false);
        setIsVerifying(true);

        // Call Gemini to identify location with Maps Grounding
        const details = await verifyLocationAndFetchDetails(c);
        setLocationName(details.name);
        setLocationAnalysis(details.description);
        setLocationVerified(details.isValidReservoir);
        setMapLink(details.mapLink);
        setIsVerifying(false);
      },
      (error) => {
        console.error(error);
        setIsLocating(false);
        alert("Unable to retrieve your location. Please ensure GPS is enabled.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords || !locationName) return;

    setIsSubmitting(true);
    
    const analysis = await generateRiskAnalysis({
        name: locationName,
        level: Number(waterLevel),
        capacity: Number(capacity)
    });

    const newEntry: ReservoirEntry = {
      id: Date.now().toString(),
      name: locationName,
      locationName: locationName,
      coordinates: coords,
      waterLevel: Number(waterLevel),
      capacityPercentage: Number(capacity),
      status: status,
      notes: notes,
      timestamp: Date.now(),
      submittedBy: user.name,
      isVerified: locationVerified,
      geminiAnalysis: analysis,
      groundingUrl: mapLink
    };

    // Simulate network delay
    setTimeout(() => {
        onSubmit(newEntry);
        setIsSubmitting(false);
        // Reset
        setWaterLevel('');
        setCapacity('');
        setNotes('');
        setStatus(ReservoirStatus.NORMAL);
        setCoords(null);
        setLocationName('');
        setLocationAnalysis('');
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <Card title="1. Geofence Verification" className="border-l-4 border-l-blue-500">
        <div className="flex flex-col gap-4">
          <p className="text-slate-600 text-sm">
            Strict Geofencing Active: You must be physically present at a recognized reservoir site.
          </p>
          
          {!coords ? (
            <Button onClick={handleGetLocation} isLoading={isLocating} className="w-full sm:w-auto">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Verify My Location
            </Button>
          ) : (
            <div className={`bg-slate-50 p-4 rounded-lg border ${locationVerified ? 'border-green-200 bg-green-50' : 'border-slate-200'}`}>
              <div className="flex items-start gap-3">
                 <div className="mt-1">
                   {isVerifying ? (
                     <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                   ) : locationVerified ? (
                     <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                     </svg>
                   ) : (
                     <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                     </svg>
                   )}
                 </div>
                 <div className="flex-1">
                    {isVerifying ? (
                      <div>
                        <h4 className="font-semibold text-slate-800">Checking Geofence...</h4>
                        <p className="text-sm text-slate-500">Consulting Google Maps via Gemini...</p>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-bold text-slate-800 text-lg">
                            {locationName || "Unknown Location"}
                        </h4>
                        <div className="flex items-center gap-2 mb-2">
                             <span className="text-xs font-mono bg-slate-200 px-1 rounded text-slate-600">
                                 {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                             </span>
                             {locationVerified ? (
                                 <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                     Geofence Valid
                                 </span>
                             ) : (
                                 <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                     Geofence Invalid
                                 </span>
                             )}
                        </div>
                        
                        <p className="text-sm text-slate-700 mb-3 bg-white p-2 rounded border border-slate-100 italic">
                            "{locationAnalysis}"
                        </p>

                        {mapLink && (
                          <a href={mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                            View Verified Location on Maps
                          </a>
                        )}
                        
                        {!locationVerified && (
                           <div className="mt-3 text-sm bg-red-50 text-red-800 p-3 rounded-lg border border-red-100 flex items-start gap-2">
                             <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                             <div>
                                 <p className="font-bold">Entry Blocked</p>
                                 <p>You are not within the authorized zone of a reservoir. Please move closer to the bund or water body.</p>
                             </div>
                           </div>
                        )}
                      </>
                    )}
                 </div>
                 <button onClick={() => setCoords(null)} className="text-slate-400 hover:text-slate-600 p-1">
                   <span className="sr-only">Reset</span>
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                     <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                   </svg>
                 </button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Only show entry form if location is strictly verified */}
      {coords && !isVerifying && locationVerified && (
        <Card title="2. Reservoir Status" className="border-l-4 border-l-green-500 animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Water Level (Meters)</label>
                <input 
                  type="number" 
                  required
                  step="0.01"
                  className="w-full rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={waterLevel}
                  onChange={(e) => setWaterLevel(Number(e.target.value))}
                  placeholder="e.g. 125.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Capacity %</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  max="100"
                  className="w-full rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  placeholder="e.g. 85"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Status</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[ReservoirStatus.NORMAL, ReservoirStatus.WARNING, ReservoirStatus.CRITICAL, ReservoirStatus.SPILLING].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`p-2 rounded-lg text-sm font-medium border ${
                      status === s 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Observation Notes</label>
              <textarea 
                rows={3}
                className="w-full rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any visual observations regarding structural integrity, rain, etc."
              />
            </div>

            <div className="pt-4">
              <Button type="submit" isLoading={isSubmitting} className="w-full">
                Submit Reservoir Data
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
};