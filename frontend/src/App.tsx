/*
 * FuelFlow Frontend Application.
 * Integrates Leaflet map visualization, route optimization, vehicle profiling,
 * and serverless PDF report generation.
 */
import React, { useState } from 'react';
import { 
  MapPin, 
  Car, 
  Navigation, 
  History,
  Route,
  Zap,
  Truck,
  Trash2,
  Save,
  Battery,
  ChevronDown,
  AlertTriangle,
  PlayCircle,
  Sparkles
} from 'lucide-react';
import { DEMO_ROUTES } from './demoRoutes';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapRecenter({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coords, map]);
  return null;
}

const PDF_SERVERLESS_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  ? '/api/report'
  : 'https://fuel-optimizer-ui-nsfr.vercel.app/api/report';

const API_BASE = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : 'http://localhost:5000';

const getFriendlyErrorMessage = (error: any) => {
  const rawMsg = error instanceof Error ? error.message : String(error);
  
  let cleanMsg = rawMsg
    .replace(/^Error:\s*/i, '')
    .replace(/^Error\s+\d+:\s*/i, '')
    .replace(/^Serverless PDF service returned:\s*\d+\s*-\s*/i, '')
    .trim();

  const lower = cleanMsg.toLowerCase();
  if (lower.includes('failed to fetch')) {
    return 'Connection failed. Please check if the backend server is running.';
  }
  if (lower.includes('429') || lower.includes('too many requests')) {
    return 'You are making too many requests. Please wait a minute before trying again.';
  }
  if (lower.includes('origin is required') || lower.includes('destination is required')) {
    return 'Please fill in both the starting city and the destination.';
  }
  if (lower.includes('origin location could not be resolved') || lower.includes('origin not found')) {
    return 'We could not locate your starting city. Please verify the name.';
  }
  if (lower.includes('destination location could not be resolved') || lower.includes('destination not found')) {
    return 'We could not locate your destination city. Please verify the name.';
  }
  if (lower.includes('routing service is currently unavailable')) {
    return 'The routing service is temporarily unavailable. Please try again later.';
  }
  if (lower.includes('failed to parse route data') || lower.includes('could not find a valid driving route')) {
    return 'No driving route found between these locations. Please check the spelling or choose reachable cities.';
  }
  if (lower.includes('trip distance exceeds') || lower.includes('exceeds 2000 km')) {
    return 'The route exceeds the 2,000 km limit. Please plan a shorter road trip.';
  }
  if (lower.includes('pdf generation failed') || lower.includes('failed to connect to the serverless pdf service')) {
    return 'We encountered an issue generating your PDF report. Please try again.';
  }
  
  return cleanMsg;
};

/** Returns the display unit for volume/energy based on fuel type */
const getUnit = (fuelType: string) => fuelType === 'Electric' ? 'kWh' : 'L';
/** Returns the display unit for price based on fuel type */
const getPriceUnit = (fuelType: string) => fuelType === 'Electric' ? '€/kWh' : '€/L';
/** Returns a label for the fuel sub-type shown in popups */
const getFuelLabel = (fuelType: string) => {
  if (fuelType === 'Diesel') return 'Diesel';
  if (fuelType === 'Petrol') return 'E5';
  return ''; // Electric doesn't need a sub-label
};

const getUserId = () => {
  if (typeof window === 'undefined') return '';
  let userId = localStorage.getItem('fuel_flow_user_id');
  if (!userId) {
    userId = 'usr_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('fuel_flow_user_id', userId);
  }
  return userId;
};

function App() {
  const [start, setStart] = useState(() => DEMO_ROUTES[0].origin);
  const [end, setEnd] = useState(() => DEMO_ROUTES[0].destination);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  type EngineType = 'Petrol' | 'Diesel' | 'Electric';
  type VehicleProfile = { id: string, name: string, type: EngineType, consumption: number, capacity: number };
  
  const defaultProfiles: VehicleProfile[] = [
    { id: '1', name: 'Skoda Octavia 1.5 TSI (Petrol)', type: 'Petrol', consumption: 6.2, capacity: 45 },
    { id: '2', name: 'Volvo XC90 B5 AWD (Diesel)', type: 'Diesel', consumption: 7.2, capacity: 71 },
    { id: '3', name: 'Tesla Model 3 LR (Electric)', type: 'Electric', consumption: 16.0, capacity: 75 }
  ];

  const [profiles, setProfiles] = useState<VehicleProfile[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fuel_flow_profiles');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return defaultProfiles;
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fuel_flow_active_profile_id');
      const savedProfiles = localStorage.getItem('fuel_flow_profiles');
      if (savedProfiles) {
        try {
          const parsed = JSON.parse(savedProfiles) as VehicleProfile[];
          if (parsed.length > 0) {
            if (saved && parsed.some(p => p.id === saved)) return saved;
            return parsed[0].id;
          }
        } catch (e) {}
      }
      if (saved) return saved;
    }
    return '1';
  });

  const [newProfileName, setNewProfileName] = useState('');
  
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || defaultProfiles[0];

  const [consumption, setConsumption] = useState(activeProfile.consumption);
  const [capacity, setCapacity] = useState(activeProfile.capacity);
  const [fuelType, setFuelType] = useState<EngineType>(activeProfile.type);

  React.useEffect(() => {
    localStorage.setItem('fuel_flow_profiles', JSON.stringify(profiles));
  }, [profiles]);

  React.useEffect(() => {
    localStorage.setItem('fuel_flow_active_profile_id', activeProfileId);
  }, [activeProfileId]);

  type FuelStop = { stationName: string, latitude: number, longitude: number, pricePerLiter: number, amountToRefuel: number };
  type ResultsType = { 
    distance: number, 
    cost: number, 
    coords: [number, number][], 
    unreachableCoords: [number, number][], 
    stops: FuelStop[], 
    isPossible: boolean, 
    stoppedAtKm: number,
    fuelType: EngineType,
    capacity: number,
    consumption: number,
    startingFuelPercent: number,
    origin: string,
    destination: string
  };
  
  const [results, setResults] = useState<ResultsType | null>(() => {
    const demo = DEMO_ROUTES[0];
    const demoProfile = defaultProfiles[0];
    const startFuelNum = parseFloat(demo.startingFuelLiters);
    return {
      distance: demo.data.totalDistanceKm,
      cost: demo.data.totalCostEur,
      coords: demo.data.routeCoordinates,
      unreachableCoords: demo.data.unreachableCoordinates || [],
      stops: demo.data.recommendedStops,
      isPossible: demo.data.isPossible,
      stoppedAtKm: demo.data.stoppedAtKm,
      fuelType: demoProfile.type,
      capacity: demoProfile.capacity,
      consumption: demoProfile.consumption,
      startingFuelPercent: Math.round((startFuelNum / demoProfile.capacity) * 100),
      origin: demo.origin,
      destination: demo.destination
    };
  });
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [startingFuelLiters, setStartingFuelLiters] = useState<string>(() => DEMO_ROUTES[0].startingFuelLiters);

  const loadDemoRoute = (demoId: string) => {
    const demo = DEMO_ROUTES.find(d => d.id === demoId);
    if (!demo) return;
    setStart(demo.origin);
    setEnd(demo.destination);
    setActiveProfileId(demo.profileId);
    setStartingFuelLiters(demo.startingFuelLiters);
    setIsDemoMode(true);
    setErrorMsg('');
    setShowHistory(false);

    const demoProfile = profiles.find(p => p.id === demo.profileId) || activeProfile;
    const startFuelNum = parseFloat(demo.startingFuelLiters);

    setResults({
      distance: demo.data.totalDistanceKm,
      cost: demo.data.totalCostEur,
      coords: demo.data.routeCoordinates,
      unreachableCoords: demo.data.unreachableCoordinates || [],
      stops: demo.data.recommendedStops,
      isPossible: demo.data.isPossible,
      stoppedAtKm: demo.data.stoppedAtKm,
      fuelType: demoProfile.type,
      capacity: demoProfile.capacity,
      consumption: demoProfile.consumption,
      startingFuelPercent: Math.round((startFuelNum / demoProfile.capacity) * 100),
      origin: demo.origin,
      destination: demo.destination
    });
  };

  const handleCalculate = async () => {
    setShowHistory(false);
    setIsDemoMode(false);
    const originClean = start.trim();
    const destClean = end.trim();

    if (!originClean || !destClean) {
      setErrorMsg('Both Origin and Destination are required.');
      return;
    }

    if (originClean.length > 100 || destClean.length > 100) {
      setErrorMsg('Origin and Destination must be 100 characters or less.');
      return;
    }

    if (isNaN(consumption) || consumption < 0.1 || consumption > 100) {
      setErrorMsg('Fuel consumption must be between 0.1 and 100.');
      return;
    }

    if (isNaN(capacity) || capacity < 1 || capacity > 1000) {
      setErrorMsg('Fuel tank capacity must be between 1 and 1000.');
      return;
    }

    const startFuelNum = parseFloat(startingFuelLiters);
    if (isNaN(startFuelNum) || startFuelNum < 0 || startFuelNum > capacity) {
      setErrorMsg(`Starting fuel level must be between 0 and ${capacity} ${getUnit(fuelType)}.`);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch(`${API_BASE}/api/trip/calculate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': getUserId()
        },
        body: JSON.stringify({
          origin: originClean,
          destination: destClean,
          fuelConsumption: consumption,
          fuelTankCapacity: capacity,
          fuelType,
          currentFuelPercent: Math.round((startFuelNum / capacity) * 100)
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      setResults({
        distance: data.totalDistanceKm,
        cost: data.totalCostEur,
        coords: data.routeCoordinates,
        unreachableCoords: data.unreachableCoordinates || [],
        stops: data.recommendedStops,
        isPossible: data.isPossible,
        stoppedAtKm: data.stoppedAtKm,
        fuelType,
        capacity,
        consumption,
        startingFuelPercent: Math.round((startFuelNum / capacity) * 100),
        origin: originClean,
        destination: destClean
      });
    } catch (error: any) {
      console.error(error);
      setErrorMsg(getFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/trip/history`, {
        headers: {
          'X-User-Id': getUserId()
        }
      });
      if (res.ok) setHistory(await res.json());
    } catch {}
  };

  const handleDownloadPdf = async () => {
    if (!results) return;
    setErrorMsg('');
    try {
      const response = await fetch(PDF_SERVERLESS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: results.origin,
          destination: results.destination,
          distance: results.distance,
          cost: results.cost,
          stops: results.stops,
          fuelType: results.fuelType,
          consumption: results.consumption,
          capacity: results.capacity,
          isPossible: results.isPossible,
          stoppedAtKm: results.stoppedAtKm,
          startingFuel: results.startingFuelPercent
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Serverless PDF service returned: ${response.status} - ${text}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trip-report-${start}-${end}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(getFriendlyErrorMessage(err));
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw', 
      padding: '24px', 
      boxSizing: 'border-box', 
      gap: '24px',
      background: 'radial-gradient(circle at 0% 0%, #1e293b 0%, #0b0f1a 100%)'
    }}>
      <aside className="glass-panel" style={{ 
        width: '420px', 
        padding: '32px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '32px',
        zIndex: 10,
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            background: 'var(--accent)', 
            padding: '10px', 
            borderRadius: '14px',
            boxShadow: '0 0 20px var(--accent-glow)'
          }}>
            <Zap size={28} color="#0b0f1a" />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>FuelFlow</h1>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>Road Trip Optimizer</span>
          </div>
        </div>

        {/* Interactive Demo Selector */}
        <div style={{
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#38bdf8' }}>
            <Sparkles size={14} />
            <span>Interactive Demo Routes</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {DEMO_ROUTES.map(demo => (
              <button
                key={demo.id}
                onClick={() => loadDemoRoute(demo.id)}
                style={{
                  background: isDemoMode && start === demo.origin ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: isDemoMode && start === demo.origin ? '1px solid #38bdf8' : '1px solid var(--border)',
                  color: isDemoMode && start === demo.origin ? '#fff' : 'var(--text-dim)',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.2s'
                }}
              >
                <PlayCircle size={12} />
                {demo.name.split(' (')[0]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label>Origin</label>
            <div style={{ position: 'relative' }}>
              <MapPin size={18} color="var(--accent)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Berlin" 
                style={{ paddingLeft: '44px' }}
                value={start}
                maxLength={100}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <label>Destination</label>
            <div style={{ position: 'relative' }}>
              <Route size={18} color="var(--accent)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Paris" 
                style={{ paddingLeft: '44px' }}
                value={end}
                maxLength={100}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255, 255, 255, 0.03)', borderStyle: 'dashed', position: 'relative' }}>
          <div 
            onClick={() => setShowProfile(!showProfile)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: showProfile ? 'center' : 'center', cursor: 'pointer', marginBottom: showProfile ? '16px' : 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Car size={16} color="var(--accent)" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Vehicle Profile</span>
            </div>
            <ChevronDown size={16} color="var(--text-dim)" style={{ transform: showProfile ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </div>
          {showProfile && (<>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
            <div>
              <label>Saved Profiles</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <select 
                  value={activeProfileId}
                  onChange={(e) => {
                    const p = profiles.find(x => x.id === e.target.value);
                    if (p) {
                      setActiveProfileId(p.id);
                      setFuelType(p.type);
                      setConsumption(p.consumption);
                      setCapacity(p.capacity);
                      setStartingFuelLiters((p.capacity * 0.5).toFixed(1));
                    }
                  }}
                  style={{ flex: 1, padding: '10px', height: '42px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', borderRadius: '8px', boxSizing: 'border-box' }}
                >
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button 
                  onClick={() => {
                    if (profiles.length > 1) {
                      const newProfiles = profiles.filter(p => p.id !== activeProfileId);
                      setProfiles(newProfiles);
                      const nextP = newProfiles[0];
                      setActiveProfileId(nextP.id);
                      setFuelType(nextP.type);
                      setConsumption(nextP.consumption);
                      setCapacity(nextP.capacity);
                      setStartingFuelLiters((nextP.capacity * 0.5).toFixed(1));
                    }
                  }}
                  style={{ padding: '0 12px', height: '42px', background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  disabled={profiles.length <= 1}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="New profile name" 
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  style={{ flex: 1, padding: '10px', height: '42px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', borderRadius: '8px', boxSizing: 'border-box' }}
                />
                <button 
                  onClick={() => {
                    if (!newProfileName) return;
                    const newP: VehicleProfile = { id: Date.now().toString(), name: newProfileName, type: fuelType, consumption, capacity };
                    setProfiles([...profiles, newP]);
                    setActiveProfileId(newP.id);
                    setNewProfileName('');
                  }}
                  style={{ padding: '0 12px', height: '42px', background: 'var(--accent)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#0b0f1a', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Save size={18} />
                </button>
              </div>
            </div>

            <div>
              <label>Engine Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button 
                  onClick={() => { setFuelType('Petrol'); setConsumption(6.2); setCapacity(45); setStartingFuelLiters('22.5'); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px', background: fuelType === 'Petrol' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.3)', border: `1px solid ${fuelType === 'Petrol' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', color: 'white', cursor: 'pointer' }}>
                  <Car size={24} color={fuelType === 'Petrol' ? 'var(--accent)' : 'var(--text-dim)'} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>Petrol</span>
                </button>
                <button 
                  onClick={() => { setFuelType('Diesel'); setConsumption(7.2); setCapacity(71); setStartingFuelLiters('35.5'); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px', background: fuelType === 'Diesel' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.3)', border: `1px solid ${fuelType === 'Diesel' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', color: 'white', cursor: 'pointer' }}>
                  <Truck size={24} color={fuelType === 'Diesel' ? 'var(--accent)' : 'var(--text-dim)'} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>Diesel</span>
                </button>
                <button 
                  onClick={() => { setFuelType('Electric'); setConsumption(16.0); setCapacity(75); setStartingFuelLiters('37.5'); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px', background: fuelType === 'Electric' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.3)', border: `1px solid ${fuelType === 'Electric' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', color: 'white', cursor: 'pointer' }}>
                  <Battery size={24} color={fuelType === 'Electric' ? 'var(--accent)' : 'var(--text-dim)'} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>Electric</span>
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label>{fuelType === 'Electric' ? 'Efficiency (kWh/100km)' : 'Consumption (L/100km)'}</label>
                <input 
                  type="number" 
                  value={consumption}
                  onChange={(e) => setConsumption(Number(e.target.value))}
                  style={{ background: 'transparent', padding: '8px 0', fontSize: '18px', fontWeight: 700, border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0 }}
                />
              </div>
              <div>
                <label>{fuelType === 'Electric' ? 'Battery (kWh)' : 'Tank Capacity (L)'}</label>
                <input 
                  type="number" 
                  value={capacity}
                  onChange={(e) => {
                    const cap = Number(e.target.value);
                    setCapacity(cap);
                    if (!isNaN(cap) && cap > 0) {
                      setStartingFuelLiters((cap * 0.5).toFixed(1));
                    }
                  }}
                  style={{ background: 'transparent', padding: '8px 0', fontSize: '18px', fontWeight: 700, border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0 }}
                />
              </div>
            </div>
          
          <div style={{ marginTop: '8px' }}>
            <label>Starting Fuel Level: {Math.max(0, Math.min(100, Math.round((parseFloat(startingFuelLiters) || 0) / (capacity || 1) * 100)))}%</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>0%</span>
              <input 
                type="range" min="0" max="100" 
                value={Math.max(0, Math.min(100, Math.round((parseFloat(startingFuelLiters) || 0) / (capacity || 1) * 100)))}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  const lit = Math.round((capacity * pct / 100) * 10) / 10;
                  setStartingFuelLiters(lit.toString());
                }}
                style={{ 
                  flex: 1, 
                  accentColor: 'var(--accent)', 
                  padding: 0, 
                  background: 'none', 
                  border: 'none',
                  height: 'auto',
                  cursor: 'pointer'
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>100%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <input 
                type="text"
                value={startingFuelLiters}
                onChange={(e) => {
                  setStartingFuelLiters(e.target.value);
                }}
                onBlur={() => {
                  let val = parseFloat(startingFuelLiters);
                  if (isNaN(val) || val < 0) {
                    setStartingFuelLiters('0');
                  } else if (val > capacity) {
                    setStartingFuelLiters(capacity.toString());
                  } else {
                    setStartingFuelLiters((Math.round(val * 10) / 10).toString());
                  }
                }}
                style={{ 
                  width: '90px', 
                  padding: '8px 10px', 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  background: 'rgba(0,0,0,0.3)', 
                  border: '1px solid var(--border)', 
                  color: 'white', 
                  borderRadius: '8px',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>
                {getUnit(fuelType)} in tank
              </span>
            </div>
          </div>
          </>)}
        </div>

        {errorMsg && (
          <div className="glass-panel" style={{ 
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px', 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)', 
            borderRadius: '14px', 
            border: '1px solid rgba(239, 68, 68, 0.25)',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.1)',
            color: '#fca5a5'
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#ef4444' }} />
            <div style={{ fontSize: '13px', lineHeight: '1.4', fontWeight: 500 }}>
              {errorMsg}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
          <button 
            className="glow-button" 
            onClick={handleCalculate}
            disabled={loading}
          >
            <Navigation size={20} />
            {loading ? 'Calculating...' : 'Optimize Route'}
          </button>
          {results && (
            <button 
              className="pdf-button" 
              onClick={handleDownloadPdf}
            >
              <Save size={20} />
              Download PDF Report
            </button>
          )}
          <button 
            onClick={() => { setShowHistory(!showHistory); fetchHistory(); }}
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border)', 
              color: 'white', 
              padding: '14px', 
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <History size={18} />
            Trip History
          </button>
          {showHistory && (
            <div className="glass-panel" style={{ padding: '16px', maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Recent Trips</div>
              {history.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No trips yet</div>
              ) : (
                history.map((h: any, i: number) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600 }}>{h.origin} → {h.destination}</div>
                    <div style={{ color: 'var(--text-dim)' }}>{h.distanceKm?.toFixed(0)} km · €{h.totalCostEur?.toFixed(2)} · {h.stopsCount} stops · {h.fuelType}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="glass-panel" style={{ 
        flex: 1, 
        position: 'relative', 
        overflow: 'hidden',
        background: '#04070d'
      }}>
        <MapContainer 
          center={results && results.coords.length > 0 ? results.coords[0] : [51.505, -0.09]} 
          zoom={results ? 6 : 4} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {results && <MapRecenter coords={results.coords} />}
          
          {results && (
            <>
              {results.coords.length > 0 && <Polyline positions={results.coords} color="#38bdf8" weight={4} opacity={0.8} />}
              {results.unreachableCoords && results.unreachableCoords.length > 0 && (
                <Polyline positions={results.unreachableCoords} color="#ef4444" weight={4} opacity={0.8} dashArray="10, 10" />
              )}
              {results.stops.map((stop, i) => (
                <Marker key={i} position={[stop.latitude, stop.longitude]}>
                  <Popup>
                    <strong>{stop.stationName}</strong><br/>
                    Price: {stop.pricePerLiter} {getPriceUnit(results.fuelType)}
                    {getFuelLabel(results.fuelType) && <> ({getFuelLabel(results.fuelType)})</>}<br/>
                    {results.fuelType === 'Electric' ? 'Charge' : 'Refuel'}: {stop.amountToRefuel} {getUnit(results.fuelType)}
                  </Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>

        {results && (
          <div style={{ position: 'absolute', bottom: '24px', left: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 1000 }}>
            
            {isDemoMode && (
              <div style={{
                background: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(8px)',
                border: '1px solid #38bdf8',
                borderRadius: '12px',
                padding: '10px 16px',
                color: '#e2e8f0',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="#38bdf8" />
                  <span>
                    <strong>Cloud Demo Mode:</strong> Viewing pre-computed optimized route. Try clicking <strong>Download PDF Report</strong> to test serverless export!
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Live APIs running on self-hosted backend</span>
              </div>
            )}
            
            {!results.isPossible && (
              <div className="pulse-warning" style={{ 
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))', 
                color: 'white', 
                padding: '20px', 
                borderRadius: '16px', 
                fontWeight: 600, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '16px', 
                boxShadow: '0 4px 30px rgba(239, 68, 68, 0.4), 0 0 60px rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}>
                <AlertTriangle size={32} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '4px' }}>⚠ Route Impossible — Fuel Ran Out!</div>
                  <div style={{ fontSize: '13px', opacity: 0.95, lineHeight: '1.5' }}>
                    Vehicle ran out of fuel at <strong>{results.stoppedAtKm.toFixed(1)} km</strong> — no reachable station was found within tank range.
                    <br/>
                    <span style={{ opacity: 0.8 }}>Try increasing the tank capacity, raising the starting fuel level, or choosing a shorter route.</span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Route size={20} color="var(--accent)" />
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Distance</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{results.distance.toFixed(1)} km</div>
                  </div>
              </div>

              <div className="glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <MapPin size={20} color="var(--accent)" />
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {results.fuelType === 'Electric' ? 'Charging Stops' : 'Fuel Stops'}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{results.stops.length}</div>
                  </div>
              </div>

              <div className="glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    background: !results.isPossible ? '#ef4444' : 'var(--accent)', 
                    color: '#0b0f1a', 
                    padding: '8px', 
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}>€</div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {!results.isPossible ? 'Incomplete Trip' : 'Estimated Cost'}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: !results.isPossible ? '#ef4444' : 'var(--accent)' }}>
                      {!results.isPossible 
                        ? `Stopped at ${results.stoppedAtKm.toFixed(0)} km` 
                        : `€${results.cost.toFixed(2)}`
                      }
                    </div>
                  </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
