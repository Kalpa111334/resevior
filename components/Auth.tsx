import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserRole } from '../types';
import { authService } from '../services/authService';
import { Button } from './Button';

interface AuthProps {
  onLoginSuccess: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onLoginSuccess }) => {
  // Mode: 'CHECK_ENROLLMENT' -> 'ENROLL' (First Time) or 'VERIFY' (Login)
  const [mode, setMode] = useState<'CHECK' | 'ENROLL' | 'VERIFY'>('CHECK');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);

  // Enrollment State
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.DATA_ENTRY_WORKER);
  const [isEnrollmentStarted, setIsEnrollmentStarted] = useState(false);

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isScanningRef = useRef(false); // Ref to track scanning status without triggering re-renders

  // 1. Check Enrollment on Mount
  useEffect(() => {
    const enrolled = authService.isDeviceEnrolled();
    setMode(enrolled ? 'VERIFY' : 'ENROLL');
  }, []);

  // 2. Start Camera when mode is VERIFY or Enrollment Started
  useEffect(() => {
    if (mode === 'VERIFY' || (mode === 'ENROLL' && isEnrollmentStarted)) {
      startCamera();
    }
    return () => {
      stopCamera();
      stopScanningLoop();
    };
  }, [mode, isEnrollmentStarted]);

  // 3. Auto-Start Scanning Logic
  useEffect(() => {
    if (mode === 'VERIFY' && streamRef.current) {
      // Small delay to let camera warm up
      const timeout = setTimeout(() => {
        startScanningLoop();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [mode]); // We only trigger this once when mode switches to VERIFY

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 } } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // For verification, start scanning once video plays
        videoRef.current.onloadedmetadata = () => {
             if(mode === 'VERIFY') startScanningLoop();
        };
      }
    } catch (err) {
      console.error("Camera Error", err);
      setError("Camera access denied. Biometric authentication requires camera permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const stopScanningLoop = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  const captureImage = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Ensure video is playing
    if (video.readyState !== 4) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  // --- AUTOMATIC VERIFICATION LOOP ---
  const startScanningLoop = () => {
    if (scanIntervalRef.current) return; // Already running

    // Scan every 3 seconds to avoid rate limits but feel "live"
    scanIntervalRef.current = setInterval(async () => {
      if (isScanningRef.current || mode !== 'VERIFY') return;

      const image = captureImage();
      if (!image) return;

      await handleAutoVerify(image);
    }, 3000);
  };

  const handleAutoVerify = async (image: string) => {
    isScanningRef.current = true;
    setIsLoading(true);
    setStatusMessage("Scanning...");
    setError(null);

    try {
      await authService.faceLogin(image);
      stopScanningLoop();
      stopCamera();
      setStatusMessage("Identity Verified");
      onLoginSuccess();
    } catch (err: any) {
      console.log("Scan failed, retrying...", err.message);
      // Don't set hard error, just status update
      setStatusMessage("Adjust face position...");
      setIsLoading(false);
      isScanningRef.current = false;
    }
  };

  // --- ENROLLMENT FLOW ---
  const handleStartEnrollment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setIsEnrollmentStarted(true);
    // Camera starts via useEffect
    // Start Countdown
    let count = 3;
    setCountdown(count);
    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            setCountdown(count);
        } else {
            clearInterval(timer);
            setCountdown(null);
            performEnrollmentCapture();
        }
    }, 1000);
  };

  const performEnrollmentCapture = async () => {
      setIsLoading(true);
      setStatusMessage("Capturing Biometric Data...");
      
      // Allow slight delay for countdown UI to clear
      await new Promise(r => setTimeout(r, 200));

      const image = captureImage();
      if (!image) {
          setError("Failed to capture. Please reload.");
          setIsLoading(false);
          return;
      }

      try {
          await authService.enrollDevice(name, role, image);
          stopCamera();
          onLoginSuccess();
      } catch (err: any) {
          setError(err.message || "Enrollment Failed");
          setIsLoading(false);
          setIsEnrollmentStarted(false); // Reset to form
      }
  };

  const handleReset = () => {
      if (confirm("This will remove the current user from this device. Continue?")) {
          authService.resetEnrollment();
          stopScanningLoop();
          setMode('ENROLL');
          setError(null);
          setName('');
          setIsEnrollmentStarted(false);
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white px-4">
      <div className="max-w-md w-full space-y-6 bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 relative overflow-hidden">
        
        {/* Futuristic Background Element */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 animate-pulse"></div>

        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-wider uppercase flex items-center justify-center gap-2">
            <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.2-2.85.564-4.14C6.275 2.505 8.948 1 12 1" /></svg>
            Biometric Access
          </h2>
          <p className="text-slate-400 text-xs mt-1 tracking-widest">
            {mode === 'ENROLL' ? 'DEVICE INITIALIZATION PROTOCOL' : 'SECURE IDENTITY VERIFICATION'}
          </p>
        </div>

        {/* Camera Feed Area */}
        { (mode === 'VERIFY' || isEnrollmentStarted) ? (
            <div className="relative mx-auto w-64 h-64 bg-black rounded-full border-4 border-slate-700 overflow-hidden shadow-inner flex items-center justify-center group">
            <video 
                ref={videoRef} 
                autoPlay 
                muted 
                playsInline
                className={`w-full h-full object-cover transform scale-x-[-1] ${isLoading ? 'opacity-80' : 'opacity-100'}`}
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Countdown Overlay */}
            {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 backdrop-blur-sm">
                    <span className="text-6xl font-bold text-cyan-400 animate-ping">{countdown}</span>
                </div>
            )}

            {/* Scanning Overlay (Verify Mode) */}
            {mode === 'VERIFY' && !isLoading && !error && (
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 w-full h-1 bg-cyan-500 shadow-[0_0_15px_rgba(34,211,238,1)] animate-[scan_2s_ease-in-out_infinite] opacity-50"></div>
                </div>
            )}

            {/* Processing Spinner */}
            {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="w-full h-full border-4 border-cyan-500/30 rounded-full animate-spin border-t-cyan-400"></div>
                </div>
            )}
            
            {/* Target Reticle */}
            {!isLoading && !countdown && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-40 h-40 border border-white/20 rounded-lg"></div>
                    <div className="absolute w-3 h-3 border-t-2 border-l-2 border-cyan-400 top-[22%] left-[22%]"></div>
                    <div className="absolute w-3 h-3 border-t-2 border-r-2 border-cyan-400 top-[22%] right-[22%]"></div>
                    <div className="absolute w-3 h-3 border-b-2 border-l-2 border-cyan-400 bottom-[22%] left-[22%]"></div>
                    <div className="absolute w-3 h-3 border-b-2 border-r-2 border-cyan-400 bottom-[22%] right-[22%]"></div>
                </div>
            )}
            </div>
        ) : (
            // Placeholder when camera is off (Enrollment Form state)
            <div className="mx-auto w-32 h-32 bg-slate-800 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </div>
        )}

        {/* Status Messages */}
        <div className="text-center h-8">
            {isLoading ? (
                <p className="text-cyan-400 text-sm font-mono animate-pulse">{statusMessage}</p>
            ) : error ? (
                <p className="text-red-400 text-sm font-bold animate-bounce">{error}</p>
            ) : mode === 'VERIFY' ? (
                <p className="text-slate-400 text-sm animate-pulse">Scanning...</p>
            ) : (
                <p className="text-slate-400 text-sm">Waiting for input</p>
            )}
        </div>

        {/* Interaction Area */}
        {mode === 'ENROLL' && !isEnrollmentStarted && (
          <form onSubmit={handleStartEnrollment} className="space-y-4 animate-fade-in-up">
            <div>
               <label className="text-xs text-slate-400 uppercase font-bold ml-1">Officer Name</label>
               <input 
                 type="text" 
                 required
                 value={name}
                 onChange={(e) => setName(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                 placeholder="Enter full name"
               />
            </div>
            <div>
               <label className="text-xs text-slate-400 uppercase font-bold ml-1">Clearance Level</label>
               <select 
                 value={role}
                 onChange={(e) => setRole(e.target.value as UserRole)}
                 className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
               >
                 <option value={UserRole.DATA_ENTRY_WORKER}>Field Worker</option>
                 <option value={UserRole.ADMIN}>Admin</option>
                 <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
               </select>
            </div>
            <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(8,145,178,0.4)] border-none"
            >
                Start Enrollment Scan
            </Button>
            <p className="text-xs text-center text-slate-500 mt-2">
                Camera will auto-capture after 3 seconds.
            </p>
          </form>
        )}
        
        {mode === 'VERIFY' && (
           <div className="text-center pt-2">
               <button 
                 onClick={handleReset}
                 className="text-xs text-slate-500 hover:text-red-400 underline decoration-slate-700 underline-offset-4"
               >
                   Reset Device Enrollment
               </button>
           </div>
        )}

      </div>
      
      {/* CSS Animation for Scanning Line */}
      <style>{`
        @keyframes scan {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};