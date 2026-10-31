export interface DemoRoute {
  id: string;
  name: string;
  origin: string;
  destination: string;
  profileId: string;
  startingFuelLiters: string;
  data: {
    totalDistanceKm: number;
    totalCostEur: number;
    isPossible: boolean;
    stoppedAtKm: number;
    recommendedStops: Array<{
      stationName: string;
      brand?: string;
      distanceAlongRouteKm: number;
      pricePerLiter: number;
      amountToRefuel: number;
      latitude: number;
      longitude: number;
    }>;
    routeCoordinates: [number, number][];
    unreachableCoordinates?: [number, number][];
  };
}

export const DEMO_ROUTES: DemoRoute[] = [
  {
    id: 'berlin-munich',
    name: 'Berlin -> Munich (585 km, Petrol)',
    origin: 'Berlin',
    destination: 'Munich',
    profileId: '1', // Skoda Octavia Petrol
    startingFuelLiters: '20',
    data: {
      totalDistanceKm: 585.4,
      totalCostEur: 53.64,
      isPossible: true,
      stoppedAtKm: 0,
      recommendedStops: [
        {
          stationName: 'JET Tankstelle Leipzig-Sud',
          brand: 'JET',
          distanceAlongRouteKm: 168.2,
          pricePerLiter: 1.68,
          amountToRefuel: 22.4,
          latitude: 51.2842,
          longitude: 12.3731
        },
        {
          stationName: 'Aral Autohof Nurnberg-Feucht',
          brand: 'Aral',
          distanceAlongRouteKm: 420.5,
          pricePerLiter: 1.72,
          amountToRefuel: 20.8,
          latitude: 49.3821,
          longitude: 11.2185
        }
      ],
      routeCoordinates: [
        [52.5200, 13.4050],
        [52.3411, 13.2501],
        [52.0523, 12.8912],
        [51.6234, 12.5122],
        [51.3397, 12.3731],
        [50.8122, 11.9721],
        [50.3211, 11.7523],
        [49.8821, 11.5211],
        [49.4521, 11.0767],
        [49.0211, 11.2311],
        [48.6122, 11.4521],
        [48.3122, 11.5821],
        [48.1351, 11.5820]
      ]
    }
  },
  {
    id: 'frankfurt-amsterdam',
    name: 'Frankfurt -> Amsterdam (440 km, Diesel)',
    origin: 'Frankfurt',
    destination: 'Amsterdam',
    profileId: '2', // Volvo XC90 Diesel
    startingFuelLiters: '25',
    data: {
      totalDistanceKm: 439.8,
      totalCostEur: 38.85,
      isPossible: true,
      stoppedAtKm: 0,
      recommendedStops: [
        {
          stationName: 'TotalEnergies Koln-West',
          brand: 'TotalEnergies',
          distanceAlongRouteKm: 185.0,
          pricePerLiter: 1.55,
          amountToRefuel: 24.5,
          latitude: 50.9375,
          longitude: 6.8621
        }
      ],
      routeCoordinates: [
        [50.1109, 8.6821],
        [50.3521, 8.2112],
        [50.6211, 7.8521],
        [50.9375, 6.9603],
        [51.2277, 6.7735],
        [51.5821, 6.3211],
        [51.8421, 5.8521],
        [52.0907, 5.1214],
        [52.3676, 4.9041]
      ]
    }
  },
  {
    id: 'vienna-salzburg-ev',
    name: 'Vienna -> Salzburg (300 km, Tesla EV)',
    origin: 'Vienna',
    destination: 'Salzburg',
    profileId: '3', // Tesla Model 3 LR Electric
    startingFuelLiters: '25',
    data: {
      totalDistanceKm: 298.6,
      totalCostEur: 18.25,
      isPossible: true,
      stoppedAtKm: 0,
      recommendedStops: [
        {
          stationName: 'Tesla Supercharger St. Valentin (Fast)',
          brand: 'Tesla',
          distanceAlongRouteKm: 152.0,
          pricePerLiter: 0.44, // EUR per kWh
          amountToRefuel: 41.5,
          latitude: 48.1752,
          longitude: 14.5312
        }
      ],
      routeCoordinates: [
        [48.2082, 16.3738],
        [48.2045, 15.6321],
        [48.1752, 14.5312],
        [48.3069, 14.2858],
        [48.0122, 13.7821],
        [47.8095, 13.0550]
      ]
    }
  }
];
