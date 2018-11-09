(function(window) {
  'use strict';
  const VERSION = '1.0.2';
  const EARTH_RADIUS_WGS84 = 6371000.8;
  const EARTH_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS_WGS84;
  const DEFAULT_LAT = 52.3858125;
  const DEFAULT_LON = 9.8096875;
  const DEFAULT_ZOOM = 18;
  let latInput = null;
  let lonInput = null;
  let plusCodeInput = null;
  let olcInput = null;
  let precCheckbox = null;
  let precisionDiv = null;
  let lastPrecCheckboxState = false;
  let gridCheckbox = null;
  let labelsCheckbox = null;
  let map = null;
  let marker = null;
  let area = null;
  let gridOverlay = null;
  let mouseLatLng = null;
  let geocoder = null;
  let lastOLCLat;
  let lastOLCLon;
  let uiInitialized = false;


  let OLC = (function() {
    const ALPHABET = '23456789CFGHJMPQRVWX'.split('');
    const CODE_LENGTH_NORMAL = 10;
    const CODE_LENGTH_EXTRA = 11;
    const DIVISOR = 20;
    const RESOLUTION = [20, 1, 1/20, 1/400, 1/8000];
    const GRID_COLS = 4;
    const GRID_ROWS = 5;
    const GRID_SIZE_DEG = RESOLUTION[RESOLUTION.length-1];
    const GRID_ROW_SIZE = GRID_SIZE_DEG / GRID_ROWS;
    const GRID_COL_SIZE = GRID_SIZE_DEG / GRID_COLS;
    const SEPARATOR = '+';
    const SEPARATOR_POSITION = 8;
    const PADDING_CHARACTER = '0';

    return {
      RESOLUTION: RESOLUTION,
      LENGTH_NORMAL: CODE_LENGTH_NORMAL,
      LENGTH_EXTRA: CODE_LENGTH_EXTRA,
      GRID_COLS: GRID_COLS,
      GRID_ROWS: GRID_ROWS,
      GRID_SIZE_DEG: GRID_SIZE_DEG,
      GRID_COL_SIZE: GRID_COL_SIZE,
      SEPARATOR_POSITION: SEPARATOR_POSITION,
      SEPARATOR: SEPARATOR,
      PADDING_CHARACTER: PADDING_CHARACTER,
      offset: extraPrecisionEnabled => {
        let offset = {
          lat: GRID_SIZE_DEG / 2,
          lon: GRID_SIZE_DEG / 2
        };
        if (extraPrecisionEnabled) {
          offset.lat /= GRID_ROWS;
          offset.lon /= GRID_COLS;
        }
        return offset;
      },
      validate: code => {
        if (!code || typeof code !== 'string') {
          return 'Invalid type';
        }
        if (code.indexOf(SEPARATOR) === -1) {
          return 'Separator missing';
        }
        if (code.indexOf(SEPARATOR) !== code.lastIndexOf(SEPARATOR)) {
          return 'More than one separator';
        }
        if (code.length === 1) {
          return 'Invalid length';
        }
        if (code.indexOf(SEPARATOR) > SEPARATOR_POSITION || code.indexOf(SEPARATOR) % 2 == 1) {
          return 'Separator on wrong position';
        }
        let padPos = code.indexOf(PADDING_CHARACTER);
        if (padPos > -1) {
          if (padPos === 0) {
            return 'Invalid padding';
          }
          var padMatch = code.match(new RegExp('(' + PADDING_CHARACTER + '+)', 'g'));
          if (padMatch.length > 1 || padMatch[0].length % 2 === 1 || padMatch[0].length > SEPARATOR_POSITION - 2) {
            return 'Invalid padding';
          }
          if (code.charAt(code.length - 1) !== SEPARATOR) {
            return 'No symbols allowed after separator if padding is present';
          }
        }
        if (code.length - code.indexOf(SEPARATOR) - 1 === 1) {
          return 'Invalid length';
        }
        code = code.replace(new RegExp('\\' + SEPARATOR + '+'), '').replace(new RegExp(PADDING_CHARACTER + '+'), '');
        for (let i = 0, len = code.length; i < len; ++i) {
          let character = code.charAt(i).toUpperCase();
          if (character !== SEPARATOR && ALPHABET.indexOf(character) === -1) {
            return 'Illegal symbols found';
          }
        }
        return '';
      },
      isValid: code => {
        return OLC.validate(code) === '';
      },
      encode: (lat_, lon_, codeLength = CODE_LENGTH_NORMAL) => {
        let lat = parseFloat(lat_);
        let lon = parseFloat(lon_);
        if (isNaN(lat) || isNaN(lon))
          return 'latitude or longitude is not a valid number';

        codeLength = Math.min(CODE_LENGTH_EXTRA, Math.max(codeLength, 2));

        /* Clip the latitude to the range -90 to 90 */
        lat = Math.min(90, Math.max(-90, lat));

        /* Normalize longitude to the range -180 to 180 */
        while (lon < -180) lon += 360;
        while (lon >= 180) lon -= 360;

        /* If the latitude is 90, compute the height of the area based
        /* on the requested code length and subtract the height from
        /* the latitude. (This ensures the area represented does not
        /* exceed 90 degrees latitude.) */
        if (lat === 90) {
          lat -= (codeLength <= CODE_LENGTH_NORMAL)
          ? Math.pow(DIVISOR, Math.floor(2 - codeLength / 2))
          : Math.pow(DIVISOR, -3) / Math.pow(GRID_ROWS, codeLength - CODE_LENGTH_NORMAL);
        }

        /* Add 90 to the latitude and 180 to the longitude to move
        /* them into the positive range */
        lat += 90;
        lon += 180;

        /* Encode up to five latitude and five longitude characters
        /* (10 in total) by converting each value into base 20
        /* (starting with a positional value of 20) and using the Open
        /* Location Code digits */
        let code = '';
        let len = Math.min(CODE_LENGTH_NORMAL, codeLength);
        for (let idx = 0; idx < len; /**/) {
          let pairCount = Math.floor(idx / 2);
          let enc = x => {
            let divisor = RESOLUTION[pairCount];
            let i = Math.floor(x / divisor);
            code += ALPHABET[i];
            ++idx;
            return x - i * divisor;
          };
          lat = enc(lat);
          lon = enc(lon);
        }
        if (codeLength < SEPARATOR_POSITION) {
          code = (code + '000000').substring(0, SEPARATOR_POSITION);
        }
        else if (codeLength === CODE_LENGTH_EXTRA) {
          let row = Math.floor((lat % GRID_ROWS) / GRID_SIZE_DEG * GRID_ROWS);
          let col = Math.floor((lon % GRID_COLS) / GRID_SIZE_DEG * GRID_COLS);
          code += ALPHABET[row * GRID_COLS + col];
        }
        /* Insert plus sign after eighth place */
        code = code.slice(0, SEPARATOR_POSITION) + SEPARATOR + code.slice(SEPARATOR_POSITION);
        return code;
      },
      decode: code => {
        if (!OLC.isValid(code)) {
          return null;
        }
        code = code.replace(SEPARATOR, '').replace(new RegExp(PADDING_CHARACTER + '+'), '').toUpperCase();
        let len = Math.min(code.length, CODE_LENGTH_NORMAL);
        let lat = 0;
        let lon = 0;
        let resolutionIdx = 0;
        for (let i = 0; i < len; i += 2) {
          lat += ALPHABET.indexOf(code[i]) * RESOLUTION[resolutionIdx];
          lon += ALPHABET.indexOf(code[i+1]) * RESOLUTION[resolutionIdx];
          ++resolutionIdx;
        }
        if (code.length === CODE_LENGTH_EXTRA) {
          let gridIdx = ALPHABET.indexOf(code[CODE_LENGTH_EXTRA-1]);
          let row = Math.floor(gridIdx / GRID_COLS);
          let col = gridIdx % GRID_COLS;
          lat += row * GRID_ROW_SIZE;
          lon += col * GRID_COL_SIZE;
          return {
            lat: lat - 90 + GRID_ROW_SIZE / 2,
            lon: lon - 180 + GRID_COL_SIZE / 2
          };
        }
        return {
          lat: lat - 90 + RESOLUTION[resolutionIdx-1] / 2,
          lon: lon - 180 + RESOLUTION[resolutionIdx-1] / 2
        };
      }
    };
  })();

  let enableExtraPrecision = (enabled = true) => {
    precCheckbox.checked = enabled;
  }

  let extraPrecisionEnabled = () => {
    return precCheckbox.checked && !precCheckbox.disabled;
  };

  let convert2plus = () => {
    let codeLength = extraPrecisionEnabled()
    ? OLC.LENGTH_EXTRA
    : OLC.LENGTH_NORMAL;
    plusCodeInput.value = OLC.encode(latInput.value, lonInput.value, codeLength);
    updateState();
  };

  let convert2coord = () => {
    let coord = OLC.decode(plusCodeInput.value);
    if (coord === null)
      return;
    let {lat, lon} = coord;
    latInput.value = parseFloat(lat.toFixed(12));
    lonInput.value = parseFloat(lon.toFixed(12));
    localStorage.setItem('lat', latInput.value);
    localStorage.setItem('lon', lonInput.value);
    placeMarker(lat, lon);
    drawOLCArea(lat, lon);
    geocoder.geocode({
      latLng: {lat: lat, lng: lon}
    }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK) {
        const ComponentTypes = [
          'administrative_area_level_1',
          'administrative_area_level_2',
          'administrative_area_level_3',
          'administrative_area_level_4',
          'sublocality_level_2',
          'sublocality_level_1',
          'postal_code',
          'locality',
          'country'];
        let address = {};
        results.forEach(r => {
          if (r.address_components) {
            r.address_components.forEach(component => {
              if (component.types) {
                component.types.filter(t => ComponentTypes.indexOf(t) > -1).forEach(type => {
                  if (!address.hasOwnProperty(type)) {
                    address[type] = component.long_name;
                  }
                });
              }
            });
          }
        });
        let locality = (address.locality
          ? address.locality
          : (address.administrative_area_level_1
            ? address.administrative_area_level_1
            : (address.administrative_area_level_2
              ? address.administrative_area_level_2
              : (address.administrative_area_level_3
                ? address.administrative_area_level_3
                : (address.administrative_area_level_4
                  ? address.administrative_area_level_4
                  : 'unbekannt'))))
        );
        olcInput.value = plusCodeInput.value.substring(4) + ' ' + locality + ', ' + address.country;
        olcInput.classList.remove('error');
      }
      else {
        olcInput.value = 'Geocoding fehlgeschlagen: ' + status;
        olcInput.classList.add('error');
      }
    });
    return {
      lat: lat,
      lon: lon
    }
  };

  let placeMarker = (lat, lon) => {
    let latLng = new google.maps.LatLng(lat, lon);
    if (marker !== null) {
      marker.setMap(null);
    }
    marker = new google.maps.Marker({
      position: latLng,
      map: map
    });
    if (!map.getBounds().contains(latLng)) {
      map.panTo(latLng);
    }
  };

  let drawOLCArea = (lat_, lon_) => {
    let precision = extraPrecisionEnabled()
    ? OLC.LENGTH_EXTRA
    : OLC.LENGTH_NORMAL;
    let pluscode = OLC.encode(lat_, lon_, precision);
    let {lat, lon} = OLC.decode(pluscode);
    if (lat === lastOLCLat && lon === lastOLCLon) {
      return;
    }
    lastOLCLat = lat;
    lastOLCLon = lon;
    if (area !== null) {
      area.setMap(null);
    }
    let offset = OLC.offset(extraPrecisionEnabled());
    area = new google.maps.Rectangle({
      clickable: false,
      strokeColor: '#ee1111',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#ee1111',
      fillOpacity: 0.3,
      map: map,
      bounds: {
        north: lat - offset.lat,
        south: lat + offset.lat,
        east: lon + offset.lon,
        west: lon - offset.lon
      }
    });
  };

  let copyToClipboard = (value) => {
    let cache = document.getElementById('clipboard-cache');
    cache.value = value;
    cache.select();
    document.execCommand('copy');
  };

  let initMap = () => {
    map = new google.maps.Map(document.getElementById('map'), {
      center: {
        lat: DEFAULT_LAT,
        lng: DEFAULT_LON
      },
      zoom: DEFAULT_ZOOM,
      options: {
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          {
            featureType: 'poi.business',
            stylers: [{visibility: 'off'}]
          },
          {
            featureType: 'transit',
            elementType: 'labels.icon',
            stylers: [{visibility: 'off'}]
          }
        ]
      }
    });
    map.addListener('maptypeid_changed', e => {
      updateState();
    });
    map.addListener('zoom_changed', () => {
      if (map.getZoom() < 20) {
        precCheckbox.disabled = true;
        precCheckbox.parentNode.classList.add('disabled');
      }
      else {
        precCheckbox.disabled = false;
        precCheckbox.parentNode.classList.remove('disabled');
      }
      updateState();
    });
    map.addListener('click', e => {
      latInput.value = e.latLng.lat();
      lonInput.value = e.latLng.lng();
      convert2plus();
      convert2coord();
    });
    map.addListener('mousemove', e => {
      mouseLatLng = e.latLng;
      drawOLCArea(e.latLng.lat(), e.latLng.lng());
    });
    map.addListener('bounds_changed', () => {
      if (!uiInitialized) {
        initUI();
        uiInitialized = true;
      }
    });

    class GridOverlay extends google.maps.OverlayView {
      constructor(map) {
        super();
        this.setMap(map);
        this._listeners = [];
        this._latGridLines = [];
        this._lonGridLines = [];
        this._divs = [];
        this._labelClass = 'olc-label';
        this._code1Class = 'code1';
        this._code2Class = 'code2';
        this._displayLabels = false;
      }
      onAdd() {
        let self = this;
        function redraw() {
          let doDraw = self._latGridLines.length > 0 && self._lonGridLines.length > 0;
          self._clear();
          if (doDraw) {
            self._draw();
          }
        }
        function clearLabels() {
          self._clearLabels();
        }
        this._listeners.push(google.maps.event.addListener(this.getMap(), 'idle',
        function() {
          /* XXX: Dirty hack. When the map is automatically rendered
          after panning, the DIV overlay seems to retain the offset
          from the point of time before panning. A slightly deferred
          rendering solves that problem. */
          setTimeout(redraw, 50);
        }));
        this._listeners.push(google.maps.event.addListener(this.getMap(), 'zoom_changed', redraw));
        this._listeners.push(google.maps.event.addListener(this.getMap(), 'dragstart', clearLabels));
      }
      onRemove() {
        this._clear();
        this._listeners.forEach(l => google.maps.event.removeListener(l));
        this._listeners = [];
      }
      draw() {
        /* nothing here, because updates are driven by the event listeners */
      }
      hide() {
        this._clear();
      }
      show() {
        this._clear();
        this._draw();
      }
      enableLabels(enabled = true) {
        this._displayLabels = enabled;
        if (enabled) {
          this.show();
        }
        else {
          this._clearLabels();
        }
      }
      get mapTypeId() {
        switch (this.getMap().getMapTypeId()) {
          case google.maps.MapTypeId.TERRAIN:
            // fall-through
          case google.maps.MapTypeId.ROADMAP:
            return google.maps.MapTypeId.ROADMAP;
          case google.maps.MapTypeId.HYBRID:
            // fall-through
          case google.maps.MapTypeId.SATELLITE:
            return google.maps.MapTypeId.SATELLITE;
          default:
            throw 'Illegal map type ID: "' + this.getMap().getMapTypeId();
        }
      }
      get strokeParams() {
        switch (this.mapTypeId) {
          case google.maps.MapTypeId.SATELLITE:
            return {
              major: {color: '#f93', opacity: .9, weight: 1},
              minor: {color: '#f93', opacity: .5, weight: .5}
            };
          case google.maps.MapTypeId.ROADMAP:
            return {
              major: {color: '#44d', opacity: .35, weight: 1},
              minor: {color: '#44d', opacity: .20, weight: .5}
            };
        }
      }
      _clear() {
        this._clearLabels();
        this._latGridLines.forEach(v => v.setMap(null));
        this._lonGridLines.forEach(v => v.setMap(null));
        this._latGridLines = [];
        this._lonGridLines = [];
      }
      _clearLabels() {
        if (this.getPanes().overlayLayer) {
          let nodes = this.getPanes().overlayLayer.children;
          let len = nodes.length;
          for (let i = len - 1; i >= 0; --i) {
            if (nodes[i].className.indexOf(this._labelClass) > -1) {
              nodes[i].parentNode.removeChild(nodes[i]);
            }
          }
        }
      }
      _drawLabels(sw, ne, latGridSize, lonGridSize) {
        let dLat = (sw.lat() % latGridSize) + (latGridSize === 20 ? 10 : 0);
        let dLon = sw.lng() % lonGridSize;
        for (let lat = sw.lat() - dLat - latGridSize; lat < ne.lat(); lat += latGridSize) {
          for (let lon = sw.lng() - dLon - lonGridSize; lon < ne.lng(); lon += lonGridSize) {
            let lo = this._llToPixels(new google.maps.LatLng({lat: lat, lng: lon}));
            let hi = this._llToPixels(new google.maps.LatLng({lat: lat + latGridSize, lng: lon + lonGridSize}));
            let h = Math.abs(hi.y - lo.y);
            let w = Math.abs(hi.x - lo.x);
            let code = OLC.encode(lat + latGridSize/2, lon + lonGridSize/2);
            let code1 = null;
            let code2 = null;
            switch (latGridSize) {
              case 20: {
                code2 = code.substr(0, 2);
                break;
              }
              case 1: {
                code2 = code.substr(0, 4);
                break;
              }
              case 1/20: {
                code2 = code.substr(4, 2);
                code1 = code.substr(0, 4);
                break;
              }
              default: {
                code2 = code.substr(4, 4);
                code1 = code.substr(0, 4);
                break;
              }
            }
            let div = document.createElement('div');
            let html = '';
            if (code1 !== null) {
              let fontSize = Math.round(w / code1.length);
              if (fontSize > 6){
                html = '<span class="' + this._code1Class +  ' ' + this.mapTypeId +
                '" style="font-size: ' + fontSize + 'px">' +
                code1 + '</span>';
              }
            }
            let fontSize = Math.round(w / code2.length / 1.2);
            if (fontSize > 6) {
              html += '<span class="' + this._code2Class + ' ' + this.mapTypeId +
              '" style="font-size: ' +  + 'px">' +
              code2 + '</span>';
            }
            if (html !== '') {
              div.innerHTML = html;
              div.className = this._labelClass;
              div.style.position = 'absolute';
              div.style.left = lo.x + 'px';
              div.style.top = (lo.y - h) + 'px';
              div.style.width = w + 'px';
              div.style.height = h + 'px';
              this.getPanes().overlayLayer.appendChild(div);
            }
          }
        }
      }
      _drawGrid(sw, ne, latGridSize, lonGridSize, sub) {
        let stroke = this.strokeParams[sub ? 'minor' : 'major'];
        let polyLineOpts = {
          clickable: false,
          strokeColor: stroke.color,
          strokeOpacity: stroke.opacity,
          strokeWeight: stroke.weight,
          map: this.getMap()
        };
        let dLon = sw.lng() % lonGridSize;
        for (let lon = sw.lng() - dLon; lon < ne.lng(); lon += lonGridSize) {
          polyLineOpts.path = [
            { lat: sw.lat(), lng: lon },
            { lat: ne.lat(), lng: lon },
          ];
          let line = new google.maps.Polyline(polyLineOpts);
          this._lonGridLines.push(line);
        }
        let dLat = (sw.lat() % latGridSize) + (latGridSize === 20 ? 10 : 0);
        for (let lat = sw.lat() - dLat; lat < ne.lat(); lat += latGridSize) {
          polyLineOpts.path = [
            { lat: lat, lng: sw.lng() },
            { lat: lat, lng: ne.lng() },
          ];
          let line = new google.maps.Polyline(polyLineOpts);
          this._latGridLines.push(line);
        }
      }
      _draw() {
        const GRID_WIDTH_THRESHOLD_PX = 7;
        let bounds = this.getMap().getBounds();
        let self = this;
        if (bounds === undefined) {
          setTimeout(function () {
            self._draw.apply(this);
          }.bind(this), 500);
        }
        else {
          goDraw.apply(this);
        }
        function goDraw() {
          let map = this.getMap();
          let ne = bounds.getNorthEast();
          let sw = bounds.getSouthWest();
          let zoom = this.getMap().getZoom();
          let subGrid = false;
          for (let resIdx = 0; resIdx < OLC.RESOLUTION.length; ++resIdx) {
            let latGridSize = OLC.RESOLUTION[resIdx];
            let lonGridSize = OLC.RESOLUTION[resIdx];
            let diametralEdge = new google.maps.LatLng(map.getCenter().lat() + latGridSize, map.getCenter().lng() + lonGridSize);
            let left = this._llToPixels(map.getCenter()).x;
            let right = this._llToPixels(diametralEdge).x;
            let dist = right - left;
            if (dist > GRID_WIDTH_THRESHOLD_PX && dist < window.innerWidth) {
              this._drawGrid(sw, ne, latGridSize, lonGridSize, subGrid);
              if (subGrid) {
                break;
              }
              else if (this._displayLabels) {
                this._drawLabels(sw, ne, latGridSize, lonGridSize);
              }
              subGrid = true;
            }
          }
          if (this._codeLength === OLC.LENGTH_EXTRA || zoom > 19) {
            let latGridSize = OLC.RESOLUTION[4] / OLC.GRID_ROWS;
            let lonGridSize = OLC.RESOLUTION[4] / OLC.GRID_COLS;
            this._drawGrid(sw, ne, latGridSize, lonGridSize, true);
          }
        }
      }
      _llToPixels(coord) {
        return this.getProjection().fromLatLngToDivPixel(coord);
      }
    }

    gridOverlay = new GridOverlay(map);
    geocoder = new google.maps.Geocoder();
  }

  let redrawOLCArea = () => {
    if (mouseLatLng !== null) {
      drawOLCArea(mouseLatLng.lat(), mouseLatLng.lng());
    }
  };

  let onKeyDown = e => {
    if (e.shiftKey) {
      lastPrecCheckboxState = precCheckbox.checked;
      precCheckbox.checked = true;
      redrawOLCArea();
    }
  };

  let onKeyUp = e => {
    if (e.keyCode === 16) {
      precCheckbox.checked = lastPrecCheckboxState;
      if (mouseLatLng !== null) {
        redrawOLCArea();
      }
    }
  };

  let parseHash = () => {
    let hash = window.location.hash.substr(1);
    let code, zoom, grid = false, labels = false, mapTypeId=google.maps.MapTypeId.ROADMAP;
    hash.split(';').forEach(v => {
      if (OLC.isValid(v.toUpperCase())) {
        code = v;
        return;
      }
      if (v === 'g') {
        grid = true;
        return;
      }
      if (v === 'l') {
        labels = true;
        return;
      }
      let zm = v.match(/^(\d+)z$/i);
      if (zm !== null && zm.length > 1) {
        zoom = parseInt(zm[1]);
        return;
      }
      let tm = v.match(new RegExp('^(' + [google.maps.MapTypeId.SATELLITE, google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.TERRAIN, google.maps.MapTypeId.HYBRID].join('|') + ')$', 'i'));
      if (tm !== null && tm.length > 1) {
        mapTypeId = tm[1];
        return;
      }
    });
    return {
      grid: grid,
      labels: labels,
      code: code,
      zoom: zoom,
      mapTypeId: mapTypeId
    };
  };

  let updateState = () => {
    localStorage.setItem('pluscode', plusCodeInput.value);
    localStorage.setItem('zoom', map.getZoom());
    localStorage.setItem('grid', gridCheckbox.checked);
    localStorage.setItem('labels', labelsCheckbox.checked);
    localStorage.setItem('mapTypeId', map.getMapTypeId());
    updateHash();
  };

  let updateHash = () => {
    let parms = [
      plusCodeInput.value,
      map.getZoom() + 'z',
      map.getMapTypeId(),
    ];
    if (gridCheckbox.checked) {
      parms.push('g');
      if (labelsCheckbox.checked) {
        parms.push('l');
      }
    }
    window.location.hash = parms.join(';');
  };

  let hashChanged = e => {
    let {code, zoom, grid, labels, mapTypeId} = parseHash();
    if (code === undefined || zoom === undefined)
      return;
    if (OLC.isValid(code)) {
      plusCodeInput.value = code;
      let {lat, lon} = convert2coord();
      placeMarker(lat, lon);
      drawOLCArea(lat, lon);
    }
    if (zoom !== map.getZoom()) {
      map.setZoom(zoom);
    }
    if (mapTypeId !== map.getMapTypeId()) {
      map.setMapTypeId(mapTypeId);
    }
    gridCheckbox.checked = grid;
    labelsCheckbox.disabled = !grid;
    if (grid) {
      labelsCheckbox.checked = labels;
      gridOverlay.enableLabels(labels);
      if (!labels) {
        gridOverlay.show();
      }
    }
    else {
      gridOverlay.hide();
      labelsCheckbox.disabled = true;
    }
  };

  let toggleGrid = () => {
    updateState();
  };

  let toggleLabels = () => {
    updateState();
  };

  let getPrecision = (deg) => {
    let x = EARTH_CIRCUMFERENCE / 360 * deg;
    if (x > 1000) {
      return (x / 1000).toFixed(0) + ' km';
    }
    return x.toFixed(1) + ' m';
  };

  let plusCodeChanged = () => {
    let code = plusCodeInput.value.toUpperCase();
    let validationResult = OLC.validate(code);
    if (validationResult.length === 0) {
      plusCodeInput.value = code;
      enableExtraPrecision(code.length-1 === OLC.LENGTH_EXTRA);
      convert2coord();
      hideBubble();
      let deg = 1/8000;
      code = code.replace(OLC.SEPARATOR, '');
      console.log(code.length);
      if (code.length === OLC.SEPARATOR_POSITION) {
        let padIdx = code.indexOf(OLC.PADDING_CHARACTER);
        console.log(code, padIdx);
        deg = (padIdx < 0) ? OLC.GRID_SIZE_DEG : OLC.RESOLUTION[padIdx/2-1]
      }
      else if (code.length === OLC.LENGTH_EXTRA) {
        deg = OLC.GRID_COL_SIZE;
      }
      precisionDiv.innerText = getPrecision(deg);
    }
    else {
      showBubble(plusCodeInput, validationResult, 3000);
      precisionDiv.innerText = '?';
    }
    plusCodeInput.setCustomValidity(validationResult);
  };

  let latLonChanged = () => {
    localStorage.setItem('lat', latInput.value);
    localStorage.setItem('lon', lonInput.value);
    convert2plus();
    plusCodeChanged();
  };

  let extraPrecChanged = () => {
    convert2plus();
    convert2coord();
  };

  let enableLongPress = (element, callback) => {
    const TIMEOUT_MS = 500;
    let pressTimer = null;
    let startTap = e => {
      if (e.type === 'click' && e.button !== 0) {
        return;
      }
      element.classList.add('longpress');
      if (pressTimer === null) {
        pressTimer = setTimeout(function() {
          callback.call();
        }, TIMEOUT_MS);
      }
    };
    let cancelTap = e => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      element.classList.remove('longpress');
    };
    element.addEventListener('mousedown', startTap);
    element.addEventListener('touchstart', startTap, {passive: true});
    element.addEventListener('mouseout', cancelTap);
    element.addEventListener('mouseup', cancelTap);
    element.addEventListener('touchend', cancelTap);
    element.addEventListener('touchleave', cancelTap);
    element.addEventListener('touchcancel', cancelTap);
  };

  let showBubbleTimer = null;
  let activeBubble = null;

  let showBubble = (where, msg, timeout_ms = 2000) => {
    hideBubble();
    let bubble = null;
    for (let i = 0; i < where.parentNode.childNodes.length; ++i) {
      if (where.parentNode.childNodes[i].classList.contains('bubble')) {
        bubble = where.parentNode.childNodes[i];
        break;
      }
    }
    if (bubble !== null) {
      bubble.classList.add('show');
      bubble.innerHTML = msg;
      activeBubble = bubble;
      showBubbleTimer = setTimeout(() => {
        bubble.classList.remove('show');
      }, timeout_ms);
    }
  };

  let hideBubble = () => {
    if (showBubbleTimer !== null) {
      clearTimeout(showBubbleTimer);
      showBubbleTimer = null;
      if (activeBubble !== null) {
        activeBubble.classList.remove('show');
        activeBubble = null;
      }
    }
  };

  let enableMessageBubble = element => {
    let div = document.createElement('div');
    div.classList.add('bubble');
    element.parentNode.appendChild(div);
  };

  let copyLatLonToClipboard = where => {
    copyToClipboard(latInput.value + ' ' + lonInput.value);
    showBubble(where, 'Breiten- und Längengrad in Zwischenablage kopiert.');
  };

  let copyOLCToClipboard = () => {
    copyToClipboard(plusCodeInput.value);
    showBubble(plusCodeInput, 'Open Location Code in Zwischenablage kopiert.');
  };

  let copyOLC2ToClipboard = () => {
    copyToClipboard(olcInput.value);
    showBubble(olcInput, 'Open Location Code in Zwischenablage kopiert.');
  };

  let initUI = () => {
    plusCodeInput = document.getElementById('pluscode');
    plusCodeInput.addEventListener('change', plusCodeChanged, true);
    plusCodeInput.addEventListener('input', plusCodeChanged, true);
    precisionDiv = document.getElementById('precision');
    let lat = localStorage.getItem('lat');
    latInput = document.getElementById('lat');
    latInput.value = lat ? lat : DEFAULT_LAT;
    latInput.addEventListener('input', latLonChanged, true);
    let lon = localStorage.getItem('lon');
    lonInput = document.getElementById('lon');
    lonInput.value = lon ? lon : DEFAULT_LON;
    lonInput.addEventListener('input', latLonChanged, true);
    enableLongPress(plusCodeInput, copyOLCToClipboard);
    enableLongPress(latInput, () => { copyLatLonToClipboard(latInput); });
    enableLongPress(lonInput, () => { copyLatLonToClipboard(lonInput); });
    enableMessageBubble(plusCodeInput);
    enableMessageBubble(latInput);
    enableMessageBubble(lonInput);
    olcInput = document.getElementById('OLC');
    enableMessageBubble(olcInput);
    enableLongPress(olcInput, copyOLC2ToClipboard);
    precCheckbox = document.getElementById('extra-precision');
    precCheckbox.addEventListener('click', extraPrecChanged, true);
    gridCheckbox = document.getElementById('show-grid');
    gridCheckbox.checked = localStorage.getItem('grid');
    gridCheckbox.addEventListener('change', toggleGrid, true);
    labelsCheckbox = document.getElementById('show-labels');
    labelsCheckbox.checked = localStorage.getItem('labels');
    labelsCheckbox.addEventListener('change', toggleLabels, true);
    window.addEventListener('hashchange', hashChanged, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.getElementById('target').addEventListener('click', () => {
      map.panTo(marker.getPosition());
    });
    convert2plus();
    document.getElementById('version').innerText = VERSION;
    hashChanged();
  };

  let main = () => {
    initMap();
  };

  window.addEventListener('load', main);
})(window);
