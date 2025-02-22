mapboxgl.accessToken = 'pk.eyJ1IjoicHJhbmF2cmFqYXJhbSIsImEiOiJjbTdheGU4dmUwOTkzMnFweTZ2bWtxa3NoIn0.-IuruHKe_pXuYGFxDkx7gA';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.0647209, 42.3662019],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

let timeFilter = -1;
let stations = [];
let trips = [];
let circles;
let radiusScale;
let stationFlow;

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);
  
  return stations.map(station => {
    const id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

function filterTripsbyTime(timeFilter) {
  if (timeFilter === -1) return trips;

  function compareMinutes(time1, time2) {
    const diff = Math.abs(time1 - time2);
    return Math.min(diff, 1440 - diff) <= 60;
  }
  
  return trips.filter(trip => {
    const startMinutes = minutesSinceMidnight(trip.started_at);
    const endMinutes = minutesSinceMidnight(trip.ended_at);
    
    return compareMinutes(startMinutes, timeFilter) || 
           compareMinutes(endMinutes, timeFilter);
  });
}

function updateScatterPlot(timeFilter) {
  const filteredTrips = filterTripsbyTime(timeFilter);
  stations = computeStationTraffic(stations, filteredTrips);
  
  radiusScale
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);
  
  circles
    .data(stations, d => d.short_name)
    .join('circle')
    .attr('r', d => radiusScale(d.totalTraffic))
    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic))
    .select('title')
    .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
}

map.on('load', async () => {
  try {
    const jsonData = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
    stations = jsonData.data.stations;
    
    const trafficData = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv');
    trafficData.forEach(trip => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
    });
    
    trips = trafficData;
    stations = computeStationTraffic(stations, trips);
    
    const svg = d3.select('#map').select('svg');
    radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stations, d => d.totalTraffic)])
      .range([0, 25]);
      
    stationFlow = d3.scaleQuantize()
      .domain([0, 1])
      .range([0, 0.5, 1]);
      
    circles = svg.selectAll('circle')
      .data(stations, d => d.short_name)
      .enter()
      .append('circle')
      .attr('r', d => radiusScale(d.totalTraffic))
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.6)
      .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic))
      .each(function(d) {
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      });

    function getCoords(station) {
      const point = map.project([station.lon, station.lat]);
      return { cx: point.x, cy: point.y };
    }

    function updatePositions() {
      circles.attr('cx', d => getCoords(d).cx)
             .attr('cy', d => getCoords(d).cy);
    }

    updatePositions();
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    map.addSource('cambridge_route', {
      type: 'geojson',
      data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson?...'
    });

    map.addLayer({
      id: 'boston-bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: {
        'line-color': '#32D400',
        'line-width': 4,
        'line-opacity': 0.5
      }
    });

    map.addLayer({
      id: 'cambridge-bike-lanes',
      type: 'line',
      source: 'cambridge_route',
      paint: {
        'line-color': '#32D400',
        'line-width': 4,
        'line-opacity': 0.5
      }
    });
  } catch (error) {
    console.error('Error loading data:', error);
  }
});

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);
  
  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }
  
  updateScatterPlot(timeFilter);
}

timeSlider.addEventListener('input', () => {
  updateTimeDisplay();
});