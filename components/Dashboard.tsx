import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, ReservoirEntry, ReservoirStatus } from '../types';
import { DataEntryForm } from './DataEntryForm';
import { Card } from './Card';
import { Button } from './Button';
import { dataService } from '../services/dataService';

// Google Maps API Key from environment
const apiKey = process.env.API_KEY || '';

// Internal Map Component using Google Maps JS API
const MapView: React.FC<{ entries: ReservoirEntry[] }> = ({ entries }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // 1. Load Google Maps Script
  useEffect(() => {
    // Define global handler for Auth Failure
    (window as any).gm_authFailure = () => {
      console.error("Google Maps Authentication Failure. Check API Key and Referrer settings.");
      setMapError("Authentication Error: The API Key provided is invalid for 'Maps JavaScript API'.");
    };

    // Check if google maps is already loaded
    if ((window as any).google && (window as any).google.maps) {
      setIsMapLoaded(true);
      return;
    }

    // Check if script is already present in DOM
    if (document.getElementById('google-maps-script')) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      setIsMapLoaded(true);
    };
    
    script.onerror = () => {
      setMapError("Network Error: Failed to load Google Maps script.");
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup global handler
      (window as any).gm_authFailure = null;
    }
  }, []);

  // 2. Initialize Map
  useEffect(() => {
    if (isMapLoaded && mapContainerRef.current && !(mapInstanceRef.current) && !mapError) {
      try {
        const google = (window as any).google;
        
        const map = new google.maps.Map(mapContainerRef.current, {
          center: { lat: 7.8731, lng: 80.7718 }, // Sri Lanka Center
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: [
            {
              "featureType": "poi",
              "elementType": "labels",
              "stylers": [{ "visibility": "off" }]
            }
          ]
        });

        mapInstanceRef.current = map;
      } catch (e) {
        console.error("Error initializing map:", e);
        setMapError("Map initialization failed. Verify Google Maps API is enabled.");
      }
    }
  }, [isMapLoaded, mapError]);

  // 3. Update Markers when entries change
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapLoaded || mapError) return;

    const google = (window as any).google;
    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const getStatusColor = (status: ReservoirStatus) => {
      switch (status) {
        case ReservoirStatus.NORMAL: return '#16a34a'; // green-600
        case ReservoirStatus.WARNING: return '#ca8a04'; // yellow-600
        case ReservoirStatus.CRITICAL: return '#ea580c'; // orange-600
        case ReservoirStatus.SPILLING: return '#dc2626'; // red-600
        default: return '#475569';
      }
    };

    // Bounds for auto-fit
    const bounds = new google.maps.LatLngBounds();

    entries.forEach(entry => {
      const color = getStatusColor(entry.status);
      const position = { lat: entry.coordinates.latitude, lng: entry.coordinates.longitude };
      
      const marker = new google.maps.Marker({
        position: position,
        map: map,
        title: entry.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        }
      });

      const infoContent = `
        <div style="font-family: sans-serif; padding: 4px; min-width: 200px;">
          <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #0f172a;">${entry.name}</h3>
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b;">${entry.locationName}</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 8px;">
            <div>
              <span style="color: #64748b;">Level:</span>
              <span style="display: block; font-weight: 600;">${entry.waterLevel}m</span>
            </div>
            <div>
              <span style="color: #64748b;">Capacity:</span>
              <span style="display: block; font-weight: 600;">${entry.capacityPercentage}%</span>
            </div>
          </div>
          <div style="padding-top: 8px; border-top: 1px solid #e2e8f0;">
             <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: ${color};">
               ${entry.status}
             </span>
          </div>
        </div>
      `;

      const infoWindow = new google.maps.InfoWindow({
        content: infoContent
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      markersRef.current.push(marker);
      bounds.extend(position);
    });

    // Auto-fit bounds if we have entries
    if (entries.length > 0) {
      map.fitBounds(bounds);
      const listener = google.maps.event.addListener(map, "idle", () => { 
        if (map.getZoom() > 14) map.setZoom(14); 
        google.maps.event.removeListener(listener); 
      });
    }
  }, [entries, isMapLoaded, mapError]);

  if (mapError) {
    return (
      <div className="h-[600px] w-full rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center p-6 text-center">
        <svg className="w-12 h-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-lg font-bold text-red-800 mb-2">Google Maps Error</h3>
        <p className="text-red-700 font-medium mb-1">{mapError}</p>
        <p className="text-sm text-red-600 mt-2 max-w-lg bg-white p-3 rounded border border-red-100 mx-auto">
          <strong>Action Required:</strong> Visit the <a href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com" target="_blank" className="underline text-red-800 font-bold">Google Cloud Console</a> and enable the "Maps JavaScript API" for your API Key project.
        </p>
      </div>
    );
  }

  return <div ref={mapContainerRef} className="h-[600px] w-full rounded-xl z-0 border border-slate-200 shadow-inner bg-slate-100" />;
};

interface DashboardProps {
  user: User;
}

export const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [entries, setEntries] = useState<ReservoirEntry[]>([]);
  const [dbSource, setDbSource] = useState<'MYSQL' | 'LOCAL'>('LOCAL');
  const [activeTab, setActiveTab] = useState<'overview' | 'entry' | 'map'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [isMissingTable, setIsMissingTable] = useState(false);

  // Load data from Service
  const loadData = async () => {
    setIsLoading(true);
    const { data, source, isMissingTable: missing } = await dataService.getEntries();
    setEntries(data);
    setDbSource(source);
    setIsMissingTable(!!missing);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 30s to keep data live
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Set default tab based on role on mount
  useEffect(() => {
    if (user.role === UserRole.DATA_ENTRY_WORKER) {
      setActiveTab('entry');
    }
  }, [user.role]);

  const handleNewEntry = async (entry: ReservoirEntry) => {
    await dataService.addEntry(entry);
    await loadData(); // Refresh data
    setActiveTab('overview');
  };

  const handleDeleteEntry = async (id: string) => {
    if (confirm('Are you sure you want to delete this record?')) {
      await dataService.deleteEntry(id);
      await loadData();
    }
  };

  const getStatusColor = (status: ReservoirStatus) => {
    switch (status) {
      case ReservoirStatus.NORMAL: return 'bg-green-100 text-green-800';
      case ReservoirStatus.WARNING: return 'bg-yellow-100 text-yellow-800';
      case ReservoirStatus.CRITICAL: return 'bg-orange-100 text-orange-800';
      case ReservoirStatus.SPILLING: return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Sidebar / Navigation Logic */}
      <div className="lg:col-span-3 space-y-4">
        {/* Missing Table Banner (Sidebar Version) */}
        {isMissingTable && (
          <div className="p-3 bg-red-600 rounded-lg text-white shadow-lg animate-pulse">
            <h4 className="font-bold text-sm mb-1 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Setup Required
            </h4>
            <p className="text-xs opacity-90">Database tables missing. Run schema.sql in Supabase.</p>
          </div>
        )}

        {/* Connection Status Indicator */}
        <div className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border ${dbSource === 'MYSQL' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
          <div className={`w-2 h-2 rounded-full ${dbSource === 'MYSQL' ? 'bg-green-500 animate-pulse' : 'bg-orange-500'}`} />
          {dbSource === 'MYSQL' ? 'Connected: Supabase (Cloud)' : 'Offline Mode: Local Storage'}
        </div>

        <Card className="p-2">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'overview' 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg className={`mr-3 h-5 w-5 ${activeTab === 'overview' ? 'text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Overview & Logs
            </button>
            
            <button
              onClick={() => setActiveTab('map')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'map' 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg className={`mr-3 h-5 w-5 ${activeTab === 'map' ? 'text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Map View
            </button>

            {(user.role === UserRole.DATA_ENTRY_WORKER || user.role === UserRole.SUPER_ADMIN) && (
              <button
                onClick={() => setActiveTab('entry')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'entry' 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <svg className={`mr-3 h-5 w-5 ${activeTab === 'entry' ? 'text-blue-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                New Data Entry
              </button>
            )}

            {user.role === UserRole.SUPER_ADMIN && (
              <button
                className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-50 opacity-50 cursor-not-allowed"
                disabled
              >
                <svg className="mr-3 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Manage Users
              </button>
            )}
          </nav>
        </Card>

        {user.role !== UserRole.DATA_ENTRY_WORKER && (
           <Card className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none">
             <h3 className="font-bold text-lg mb-1">Live Database</h3>
             <p className="text-3xl font-bold">{entries.length}</p>
             <p className="text-blue-100 text-sm mt-2">Verified Reservoir Records</p>
           </Card>
        )}
      </div>

      {/* Main Content Area */}
      <div className="lg:col-span-9">
         {/* Main Error Banner */}
         {isMissingTable && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-4 shadow-sm">
                <div className="bg-red-100 p-2 rounded-full text-red-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <div>
                    <h3 className="text-red-900 font-bold text-lg">Supabase Configuration Required</h3>
                    <p className="text-red-700 mt-1">
                        The application cannot save data because the database tables do not exist.
                    </p>
                    <div className="mt-3 bg-white border border-red-100 rounded p-3 text-sm font-mono text-red-800">
                        1. Copy the content of <span className="font-bold">schema.sql</span><br/>
                        2. Go to your <a href="https://supabase.com/dashboard/project/mfgurigjcxovztmyzkrl/sql" target="_blank" className="underline font-bold">Supabase SQL Editor</a><br/>
                        3. Paste and run the script to create the 'reservoir_entries' table.
                    </div>
                </div>
            </div>
         )}

        {activeTab === 'entry' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Record New Measurement</h2>
            <DataEntryForm user={user} onSubmit={handleNewEntry} />
          </div>
        )}

        {activeTab === 'map' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900">
                Reservoir Map Visualization (Google Maps)
              </h2>
            </div>
            <Card className="p-1">
              {entries.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center bg-slate-50 rounded-xl text-slate-400">
                  <p>No verified locations to display on map yet.</p>
                </div>
              ) : (
                <MapView entries={entries} />
              )}
            </Card>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900">
                {user.role === UserRole.DATA_ENTRY_WORKER ? "My Recent Entries" : "National Reservoir Status"}
              </h2>
              {isLoading && <span className="text-xs text-slate-400 animate-pulse">Syncing...</span>}
            </div>

            {entries.length === 0 && !isLoading ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-slate-900">No data entries yet</h3>
                <p className="mt-1 text-sm text-slate-500">Get started by verifying a location and adding data.</p>
                {(user.role === UserRole.DATA_ENTRY_WORKER || user.role === UserRole.SUPER_ADMIN) && (
                  <div className="mt-6">
                    <Button onClick={() => setActiveTab('entry')}>Add First Entry</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                {entries.map((entry) => (
                  <Card key={entry.id} className="hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-slate-900">{entry.name}</h3>
                              {entry.isVerified && (
                                <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 border border-green-200">
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                  Valid Geofence
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 mt-1">{entry.locationName}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusColor(entry.status)}`}>
                            {entry.status}
                          </span>
                        </div>
                        
                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500">Water Level</p>
                            <p className="font-semibold text-slate-900">{entry.waterLevel} m</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Capacity</p>
                            <p className="font-semibold text-slate-900">{entry.capacityPercentage}%</p>
                          </div>
                          <div>
                             <p className="text-slate-500">Reporter</p>
                             <p className="font-semibold text-slate-900">{entry.submittedBy}</p>
                          </div>
                          <div>
                             <p className="text-slate-500">Time</p>
                             <p className="font-semibold text-slate-900">{new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                          </div>
                        </div>

                        {entry.geminiAnalysis && (
                          <div className="mt-4 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                             <p className="text-xs text-indigo-800 font-medium flex items-center gap-1 mb-1">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                               Gemini Risk Analysis
                             </p>
                             <p className="text-sm text-indigo-900 leading-relaxed">{entry.geminiAnalysis}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex md:flex-col justify-between md:justify-start gap-2 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4 min-w-[120px]">
                           {entry.groundingUrl && (
                             <a 
                               href={entry.groundingUrl} 
                               target="_blank" 
                               rel="noreferrer"
                               className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                             >
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                               Google Maps
                             </a>
                           )}

                           {(user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) && (
                             <Button 
                                variant="ghost" 
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="text-xs px-2 h-8 text-red-600 hover:text-red-700 w-full justify-start"
                             >
                               Delete Entry
                             </Button>
                           )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};