(function(window) {
  'use strict';
  const VERSION = '1.2.4';
  const TRUE = '1'; // needed for localStorage
  const FALSE = '0';
  const MAP_TYPES = ['roadmap', 'terrain', 'satellite', 'hybrid'];
  const DEFAULT_PLUSCODE = '9F4F9RP5+8V';
  const DEFAULT_ZOOM = 18;
  const DEFAULT_MAPTYPE_ID = 'roadmap';
  const DEFAULT_GEOCODING = FALSE;
  let clipboardCache = null;
  let latInput = null;
  let lngInput = null;
  let plusCodeInput = null;
  let olcOutput = null;
  let gridControl = null;
  let labelsControl = null;
  let extraPrecisionEnabled = false;
  let map = null;
  let marker = null;
  let olcArea = null;
  let showBubbleTimer = null;
  let activeBubble = null;
  let gridOverlay = null;
  let geocoder = null;
  let geocodingCheckbox = null;
  let mouseLatLng = null;
  let lastOLCCoord = {lat: undefined, lng: undefined};
  let lastZoom = DEFAULT_ZOOM;


  let OLC = (function() {
    const OLC_DIGITS = '23456789CFGHJMPQRVWX';
    const ALPHABET = OLC_DIGITS.split('');
    const CODE_LENGTH_NORMAL = 10;
    const CODE_LENGTH_EXTRA = 11;
    const DIVISOR = 20;
    const RESOLUTION = [20, 1, 1/20, 1/400, 1/8000];
    const GRID_SIZE_DEG = RESOLUTION[4];
    const GRID_COLS = 4;
    const GRID_ROWS = 5;
    const GRID_ROW_SIZE = GRID_SIZE_DEG / GRID_ROWS;
    const GRID_COL_SIZE = GRID_SIZE_DEG / GRID_COLS;
    const SEPARATOR = '+';
    const SEPARATOR_POSITION = 8;
    const PADDING_CHARACTER = '0';
    const PADDING_REGEX = new RegExp(`(${PADDING_CHARACTER}+)`, 'g');
    const SEPARATOR_REGEX = new RegExp(`\\${SEPARATOR}+`);

    return {
      RESOLUTION: RESOLUTION,
      LENGTH_NORMAL: CODE_LENGTH_NORMAL,
      LENGTH_EXTRA: CODE_LENGTH_EXTRA,
      GRID_COLS: GRID_COLS,
      GRID_ROWS: GRID_ROWS,
      GRID_SIZE_DEG: GRID_SIZE_DEG,
      GRID_ROW_SIZE: GRID_ROW_SIZE,
      GRID_COL_SIZE: GRID_COL_SIZE,
      SEPARATOR_POSITION: SEPARATOR_POSITION,
      SEPARATOR: SEPARATOR,
      PADDING_CHARACTER: PADDING_CHARACTER,
      offset: extraPrecisionEnabled => {
        let offset = {
          lat: GRID_SIZE_DEG / 2,
          lng: GRID_SIZE_DEG / 2
        };
        if (extraPrecisionEnabled) {
          offset.lat /= GRID_ROWS;
          offset.lng /= GRID_COLS;
        }
        return offset;
      },
      // see OpenLocationCode.isValid() in https://github.com/google/open-location-code/blob/master/js/src/openlocationcode.js
      validate: code => {
        if (!code || typeof code !== 'string') {
          return 'Invalid type';
        }
        let sepIdx = code.indexOf(SEPARATOR);
        if (sepIdx === -1) {
          return 'Separator missing';
        }
        if (sepIdx !== code.lastIndexOf(SEPARATOR)) {
          return 'More than one separator';
        }
        if (code.length - sepIdx - 1 === 1) {
          return 'Invalid length';
        }
        if (sepIdx > SEPARATOR_POSITION || sepIdx % 2 === 1) {
          return 'Separator on wrong position';
        }
        let padPos = code.indexOf(PADDING_CHARACTER);
        if (padPos > -1) {
          if (padPos < 3) {
            return 'Invalid padding';
          }
          var padMatch = code.match(PADDING_REGEX);
          if (padMatch.length > 1 || padMatch[0].length % 2 === 1 || padMatch[0].length > SEPARATOR_POSITION - 2) {
            return 'Invalid padding';
          }
          if (code.charAt(code.length - 1) !== SEPARATOR) {
            return 'No symbols allowed after separator if padding is present';
          }
        }
        code = code.replace(SEPARATOR_REGEX, '').replace(PADDING_REGEX, '');
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
      encode: (coord, codeLength = CODE_LENGTH_NORMAL) => {
        let lat = coord.lat;
        let lng = coord.lng;
        if (isNaN(lat) || isNaN(lng))
          return 'latitude or longitude is not a valid number';

        codeLength = Math.min(CODE_LENGTH_EXTRA, Math.max(codeLength, 2));

        /* Clip the latitude to the range -90 to 90 */
        lat = Math.min(90, Math.max(-90, lat));

        /* Normalize longitude to the range -180 to 180 */
        while (lng < -180) lng += 360;
        while (lng >= 180) lng -= 360;

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
        lng += 180;

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
          lng = enc(lng);
        }
        if (codeLength < SEPARATOR_POSITION) {
          code = (code + '000000').substring(0, SEPARATOR_POSITION);
        }
        else if (codeLength === CODE_LENGTH_EXTRA) {
          let row = Math.floor((lat % GRID_ROWS) / GRID_SIZE_DEG * GRID_ROWS);
          let col = Math.floor((lng % GRID_COLS) / GRID_SIZE_DEG * GRID_COLS);
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
        code = code.replace(SEPARATOR, '').replace(PADDING_REGEX, '').toUpperCase();
        let len = Math.min(code.length, CODE_LENGTH_NORMAL);
        let lat = 0;
        let lng = 0;
        let resolutionIdx = 0;
        for (let i = 0; i < len; i += 2) {
          lat += ALPHABET.indexOf(code[i]) * RESOLUTION[resolutionIdx];
          lng += ALPHABET.indexOf(code[i+1]) * RESOLUTION[resolutionIdx];
          ++resolutionIdx;
        }
        if (code.length === CODE_LENGTH_EXTRA) {
          let gridIdx = ALPHABET.indexOf(code[CODE_LENGTH_EXTRA-1]);
          let row = Math.floor(gridIdx / GRID_COLS);
          let col = gridIdx % GRID_COLS;
          lat += row * GRID_ROW_SIZE;
          lng += col * GRID_COL_SIZE;
          return {
            lat: lat - 90 + GRID_ROW_SIZE / 2,
            lng: lng - 180 + GRID_COL_SIZE / 2
          };
        }
        return {
          lat: lat - 90 + RESOLUTION[resolutionIdx-1] / 2,
          lng: lng - 180 + RESOLUTION[resolutionIdx-1] / 2
        };
      }
    };
  })();

  let geocodeOLC = (coord) => {
    if (geocodingEnabled) {
      geocoder.geocode({
        latLng: coord
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
          olcOutput.value = `${plusCodeInput.value.substring(4)} ${locality}, ${address.country}`;
          olcOutput.classList.remove('error');
        }
        else {
          olcOutput.value = `Geocoding fehlgeschlagen: ${status}`;
          olcOutput.classList.add('error');
        }
      });
    }
  };

  let convert2plus = () => {
    plusCodeInput.value = OLC.encode({lat: +latInput.value, lng: +lngInput.value},
      extraPrecisionEnabled ? OLC.LENGTH_EXTRA : OLC.LENGTH_NORMAL);
  };

  let convert2coord = () => {
    let coord = OLC.decode(plusCodeInput.value);
    if (coord) {
      latInput.value = +coord.lat.toFixed(12);
      lngInput.value = +coord.lng.toFixed(12);
      return coord;
    }
    return null;
  };

  let placeMarker = coord => {
    if (marker) {
      marker.setMap(null);
    }
    marker = new google.maps.Marker({
      position: coord,
      map: map
    });
  };

  let drawOLCArea = coord_ => {
    let pluscode = OLC.encode(coord_, extraPrecisionEnabled ? OLC.LENGTH_EXTRA : OLC.LENGTH_NORMAL);
    let coord = OLC.decode(pluscode);
    if (coord.lat !== lastOLCCoord.lat || coord.lng !== lastOLCCoord.lng) {
      lastOLCCoord = coord;
      if (olcArea) {
        olcArea.setMap(null);
      }
      let offset = OLC.offset(extraPrecisionEnabled);
      olcArea = new google.maps.Rectangle({
        clickable: false,
        strokeColor: '#e11',
        strokeOpacity: .8,
        strokeWeight: 2,
        fillColor: '#e11',
        fillOpacity: .3,
        map: map,
        bounds: {
          north: coord.lat - offset.lat,
          south: coord.lat + offset.lat,
          east: coord.lng + offset.lng,
          west: coord.lng - offset.lng
        }
      });
    }
  };

  let copyToClipboard = value => {
    clipboardCache.value = value;
    clipboardCache.select();
    document.execCommand('copy');
  };

  class MapControl {
    constructor(params) {
      this._div = document.createElement('div');
      this._div.innerHTML = params.contents;
      this._div.className = 'map-control clickable';
      this._div.index = 1;
      params.opts = params.opts || {};
      Object.keys(params.opts).forEach(function(key) {
        this._div.dataset[key] = params.opts[key];
      }.bind(this));
      if (params.title) {
        this._div.title = params.title;
      }
      if (params.opts.disabled === TRUE) {
        this._div.classList.add('disabled');
      }
      this._div.addEventListener('click', () => {
        if (this._div.dataset.hasOwnProperty('enabled')) {
          this.toggleEnabled();
        }
        params.callback.call();
      });
    }
    toggleEnabled() {
      this._div.dataset.enabled = this._div.dataset.enabled === TRUE ? FALSE : TRUE;
      if (this._div.dataset.enabled === TRUE) {
        this._div.classList.add('enabled');
      }
      else {
        this._div.classList.remove('enabled');
      }
    }
    get element() {
      return this._div;
    }
    get data() {
      return this._div.dataset;
    }
  }

  let initMap = (center, zoom, mapTypeId) => {
    map = new google.maps.Map(document.getElementById('map'), {
      center: center,
      zoom: zoom,
      mapTypeId: mapTypeId,
      gestureHandling: 'greedy',
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
    let boundsChangedHandler = map.addListener('bounds_changed', () => {
      google.maps.event.removeListener(boundsChangedHandler);
      evaluateHash();
      if (!map.getBounds().contains(center)) {
        map.panTo(center);
      }
    });
    map.addListener('maptypeid_changed', () => {
      updateState();
    });
    map.addListener('click', e => {
      latInput.value = e.latLng.lat();
      lngInput.value = e.latLng.lng();
      convert2plus();
      convert2coord();
      updateState();
    });
    map.addListener('mousemove', e => {
      mouseLatLng = e.latLng;
      drawOLCArea({lat: mouseLatLng.lat(), lng: mouseLatLng.lng()});
    });
    map.addListener('idle', () => {
      updateState();
    });

    let additionalControls = document.createElement('div');
    additionalControls.className = 'additional-controls';
    let centerControl = new MapControl({
        contents: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35"><use xlink:href="#target" x="0" y="0"/></svg>',
        title: 'Auf Markierung zentrieren',
        callback: () => {
          map.panTo(marker.getPosition());
        }
      });
    additionalControls.appendChild(centerControl.element);

    gridControl = new MapControl({
        contents: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35"><use xlink:href="#grid" x="0" y="0"/></svg>',
        title: 'Gitter ein-/ausschalten',
        callback: () => {
          updateLabelsControl();
          updateState();
        },
        opts: {
          enabled: FALSE
        }
      });
    additionalControls.appendChild(gridControl.element);

    labelsControl = new MapControl({
        contents: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35"><use xlink:href="#labels" x="0" y="0"/></svg>',
        title: 'Beschriftung ein-/ausschalten',
        callback: () => {
          updateState();
        },
        opts: {
          enabled: FALSE
        }
      });
    additionalControls.appendChild(labelsControl.element);

    map.controls[google.maps.ControlPosition.TOP_LEFT].push(additionalControls);

    class GridOverlay extends google.maps.OverlayView {
      constructor(map) {
        super();
        this.setMap(map);
        this._listeners = [];
        this._gridLines = [];
        this._divs = [];
        this._labelClass = 'olc-label';
        this._code1Class = 'code1';
        this._code2Class = 'code2';
        this._code3Class = 'code3';
        this._displayLabels = false;
      }
      onAdd() {
        let self = this;
        function redraw() {
          let doRedraw = self._gridLines.length > 0;
          self._clear();
          if (doRedraw) {
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
            throw `Illegal map type ID: ${this.getMap().getMapTypeId()}`;
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
        this._gridLines.forEach(v => v.setMap(null));
        this._gridLines = [];
      }
      _clearLabels() {
        if (this.getPanes() && this.getPanes().overlayLayer) {
          let nodes = this.getPanes().overlayLayer.children;
          let len = nodes.length;
          for (let i = len - 1; i >= 0; --i) {
            if (nodes[i].className.indexOf(this._labelClass) > -1) {
              nodes[i].parentNode.removeChild(nodes[i]);
            }
          }
        }
      }
      _drawLabels(sw, ne, latGridSize, lngGridSize) {
        let dLat = (sw.lat() % latGridSize) + (latGridSize === 20 ? 10 : 0);
        let dLon = sw.lng() % lngGridSize;
        const RES = OLC.RESOLUTION;
        let makeSpan = (className, w, fontScale, code) => {
          if (code) {
            let fontSize = Math.round(w / code.length * fontScale);
            return fontSize < 7 ? '' : `<span class="${className} ${this.mapTypeId}" style="font-size: ${fontSize}px">${code}</span>`;
          }
          return '';
        }
        for (let lat = sw.lat() - dLat; lat < ne.lat(); lat += latGridSize) {
          for (let lng = sw.lng() - dLon; lng < ne.lng(); lng += lngGridSize) {
            let lo = this._llToPixels(new google.maps.LatLng({lat: lat, lng: lng}));
            let hi = this._llToPixels(new google.maps.LatLng({lat: lat + latGridSize, lng: lng + lngGridSize}));
            let h = Math.abs(hi.y - lo.y);
            let w = Math.abs(hi.x - lo.x);
            let code = OLC.encode({lat: lat + latGridSize/2, lng: lng + lngGridSize/2});
            let code1, code2, code3;
            switch (latGridSize) {
              case RES[0]: {
                code1 = code.substr(0, 2);
                break;
              }
              case RES[1]: {
                code1 = code.substr(0, 4);
                break;
              }
              case RES[2]: {
                code1 = code.substr(0, 4);
                code2 = code.substr(4, 2);
                break;
              }
              case RES[3]: {
                code1 = code.substr(0, 4);
                code2 = code.substr(4, 4);
                break;
              }
              case RES[4]: {
                code1 = code.substr(0, 4);
                code2 = code.substr(4, 4);
                code3 = code.substr(9, 2);
                break;
              }
            }
            let html = makeSpan(this._code1Class, w, .83, code1) + makeSpan(this._code2Class, w, .63, code2) + makeSpan(this._code3Class, w, .32, code3);
            if (html.length > 0) {
              let div = document.createElement('div');
              div.innerHTML = html;
              div.className = this._labelClass;
              div.setAttribute('style', `position: absolute; left: ${lo.x}px; top: ${lo.y - h}px; width: ${w}px; height: ${h}px`);
              this.getPanes().overlayLayer.appendChild(div);
            }
          }
        }
      }
      _drawGrid(sw, ne, latGridSize, lngGridSize, sub) {
        let stroke = this.strokeParams[sub ? 'minor' : 'major'];
        let polyLineOpts = {
          clickable: false,
          strokeColor: stroke.color,
          strokeOpacity: stroke.opacity,
          strokeWeight: stroke.weight,
          map: this.getMap()
        };
        let dLon = sw.lng() % lngGridSize;
        for (let lng = sw.lng() - dLon; lng < ne.lng(); lng += lngGridSize) {
          polyLineOpts.path = [
            { lat: sw.lat(), lng: lng },
            { lat: ne.lat(), lng: lng },
          ];
          let line = new google.maps.Polyline(polyLineOpts);
          this._gridLines.push(line);
        }
        let dLat = (sw.lat() % latGridSize) + (latGridSize === 20 ? 10 : 0);
        for (let lat = sw.lat() - dLat; lat < ne.lat(); lat += latGridSize) {
          polyLineOpts.path = [
            { lat: lat, lng: sw.lng() },
            { lat: lat, lng: ne.lng() },
          ];
          let line = new google.maps.Polyline(polyLineOpts);
          this._gridLines.push(line);
        }
      }
      _draw() {
        const GRID_WIDTH_THRESHOLD_PX = 7;
        let bounds = this.getMap().getBounds();
        let self = this;
        if (bounds === undefined) {
          setTimeout(function () {
            self._draw.apply(this);
          }.bind(this), 100);
        }
        else {
          goDraw.apply(this);
        }
        function goDraw() {
          let innerWidth = window.innerWidth; // not in loop to prevent layout thrashing
          let map = this.getMap();
          let center = map.getCenter();
          let zoom = map.getZoom();
          let ne = bounds.getNorthEast();
          let sw = bounds.getSouthWest();
          let subGrid = false;
          const RES = OLC.RESOLUTION;
          for (let resIdx = 0; resIdx < RES.length; ++resIdx) {
            let latGridSize = RES[resIdx];
            let lngGridSize = latGridSize;
            let diametralEdge = new google.maps.LatLng(center.lat() + latGridSize, center.lng() + lngGridSize);
            let left = this._llToPixels(center).x;
            let right = this._llToPixels(diametralEdge).x;
            let dist = right - left;
            if (dist > GRID_WIDTH_THRESHOLD_PX && dist < innerWidth) {
              this._drawGrid(sw, ne, latGridSize, lngGridSize, subGrid);
              if (subGrid) {
                break;
              }
              else if (this._displayLabels) {
                this._drawLabels(sw, ne, latGridSize, lngGridSize);
              }
              subGrid = true;
            }
          }
          if (this._codeLength === OLC.LENGTH_EXTRA || zoom > 19) {
            this._drawGrid(sw, ne, OLC.GRID_ROW_SIZE, OLC.GRID_COL_SIZE, true);
          }
        }
      }
      _llToPixels(latLng) {
        return this.getProjection().fromLatLngToDivPixel(latLng);
      }
    }

    gridOverlay = new GridOverlay(map);
    geocoder = new google.maps.Geocoder();
  }

  let redrawOLCArea = () => {
    if (mouseLatLng !== null) {
      drawOLCArea({lat: mouseLatLng.lat(), lng: mouseLatLng.lng()});
    }
  };

  let onKeyDown = e => {
    if (e.shiftKey) {
      extraPrecisionEnabled = true;
      redrawOLCArea();
    }
  };

  let onKeyUp = e => {
    if (e.keyCode === 16) {
      extraPrecisionEnabled = false;
      redrawOLCArea();
    }
  };

  let parseHash = () => {
    const ZoomRegex = new RegExp('^(\\d+)z$');
    let hash = window.location.hash.substr(1);
    let code, zoom, grid = FALSE, labels = FALSE, mapTypeId = google.maps.MapTypeId.ROADMAP, geocoding = FALSE;
    hash.split(';').forEach(v => {
      if (OLC.isValid(v.toUpperCase())) {
        code = v;
        return;
      }
      if (v === 'g') {
        grid = TRUE;
        return;
      }
      if (v === 'gc') {
        geocoding = TRUE;
        return;
      }
      if (v === 'l') {
        labels = TRUE;
        return;
      }
      let zm = ZoomRegex.exec(v);
      if (zm !== null && zm.length > 1) {
        let z = Math.round(zm[1]);
        if (!isNaN(z)) {
          zoom = z;
        }
        return;
      }
      if (MAP_TYPES.includes(v)) {
        mapTypeId = v;
        return;
      }
    });
    let result = {
      grid: grid,
      labels: labels,
      code: code,
      zoom: zoom,
      mapTypeId: mapTypeId,
      geocoding: geocoding
    };
    // console.log('parseHash() -> ', result);
    return result;
  };

  let updateState = () => {
    localStorage.setItem('pluscode', plusCodeInput.value);
    localStorage.setItem('zoom', map.getZoom());
    localStorage.setItem('mapTypeId', map.getMapTypeId());
    localStorage.setItem('geocoding', geocodingEnabled ? TRUE : FALSE);
    if (gridControl && labelsControl) {
      localStorage.setItem('grid', gridControl.data.enabled);
      localStorage.setItem('labels', labelsControl.data.enabled);
    }
    updateHash();
  };

  let updateHash = () => {
    let parms = [
      plusCodeInput.value,
      map.getMapTypeId(),
    ];
    if (gridControl && gridControl.data.enabled === TRUE) {
      parms.push('g');
      if (labelsControl && labelsControl.data.enabled === TRUE) {
        parms.push('l');
      }
    }
    if (geocodingEnabled) {
      parms.push('gc');
    }
    window.location.hash = parms.join(';');
  };

  let evaluateHash = () => {
    let {code, grid, labels, mapTypeId, geocoding} = parseHash();
    if (code) {
      if (OLC.isValid(code)) {
        plusCodeInput.value = code;
        updateMap();
        if (!map.getBounds().contains(marker.getPosition())) {
          map.panTo(marker.getPosition());
        }
      }
      if (mapTypeId !== map.getMapTypeId()) {
        map.setMapTypeId(mapTypeId);
      }
      if (geocoding === TRUE) {
        olcOutput.disabled = false;
        geocodingEnabled = true;
        geocodeOLC(marker.getPosition());
      }
      else {
        olcOutput.value = '';
        olcOutput.disabled = true;
        geocodingEnabled = false;
      }
      if (gridControl) {
        gridControl.data.enabled = grid;
        updateLabelsControl();
        if (grid === TRUE) {
          labelsControl.data.enabled = labels;
          gridOverlay.enableLabels(labels === TRUE);
          if (labels === FALSE) {
            gridOverlay.show();
          }
        }
        else {
          gridOverlay.hide();
        }
      }
    }
  };

  let updateMap = () => {
    let coord = convert2coord();
    placeMarker(coord);
    drawOLCArea(coord);
    geocodeOLC(coord);
  };

  let updateLabelsControl = () => {
    if (gridControl.data.enabled === FALSE) {
      labelsControl.element.classList.add('disabled');
    }
    else {
      labelsControl.element.classList.remove('disabled');
    }
  };

  let plusCodeChanged = () => {
    let code = plusCodeInput.value.toUpperCase();
    let validationResult = OLC.validate(code);
    if (validationResult.length === 0) {
      plusCodeInput.value = code;
      updateState();
      hideBubble();
    }
    else {
      showBubble(plusCodeInput, validationResult, 3000);
    }
    plusCodeInput.setCustomValidity(validationResult);
  };

  let latLonChanged = () => {
    convert2plus();
    plusCodeChanged();
    updateState();
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
    element.addEventListener('mousemove', cancelTap);
    element.addEventListener('mouseup', cancelTap);
    element.addEventListener('touchend', cancelTap);
    element.addEventListener('touchleave', cancelTap);
    element.addEventListener('touchcancel', cancelTap);
  };

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
    copyToClipboard(latInput.value + ' ' + lngInput.value);
    showBubble(where, 'Breiten- und Längengrad in Zwischenablage kopiert.');
  };

  let copyOLCToClipboard = () => {
    copyToClipboard(plusCodeInput.value);
    showBubble(plusCodeInput, 'Open Location Code in Zwischenablage kopiert.');
  };

  let copyOLC2ToClipboard = () => {
    copyToClipboard(olcOutput.value);
    showBubble(olcOutput, 'Open Location Code in Zwischenablage kopiert.');
  };

  let main = () => {
    Object.defineProperty(window, 'geocodingEnabled', {
      get: () => geocodingCheckbox.checked,
      set: enabled => geocodingCheckbox.checked = enabled,
    });
    clipboardCache = document.getElementById('clipboard-cache');
    document.getElementById('version').innerText = VERSION;
    plusCodeInput = document.getElementById('pluscode');
    plusCodeInput.addEventListener('change', plusCodeChanged, true);
    plusCodeInput.addEventListener('input', plusCodeChanged, true);
    enableLongPress(plusCodeInput, copyOLCToClipboard);
    enableMessageBubble(plusCodeInput);
    let hashData = parseHash();
    let stored = {
      zoom: localStorage.getItem('zoom'),
      pluscode: localStorage.getItem('pluscode'),
      geocoding: localStorage.getItem('geocoding'),
      mapTypeId: localStorage.getItem('mapTypeId')
    };
    let zoom = hashData.zoom
    ? hashData.zoom
    : (!isNaN(+stored.zoom)
      ? +stored.zoom
      : DEFAULT_ZOOM);
    let mapTypeId = hashData.mapTypeId
    ? hashData.mapTypeId
    : (MAP_TYPES.includes(stored.mapTypeId)
      ? stored.mapTypeId
      : DEFAULT_MAPTYPE_ID);
    let pluscode = hashData.code
    ? hashData.code
    : (OLC.isValid(stored.pluscode)
      ? stored.pluscode
      : DEFAULT_PLUSCODE);
    let geocoding = hashData.geocoding
    ? hashData.geocoding
    : (stored.geocoding === TRUE
      ? stored.geocoding
      : DEFAULT_GEOCODING);
    plusCodeInput.value = pluscode;
    let center = OLC.decode(pluscode);
    latInput = document.getElementById('lat');
    latInput.value = center.lat;
    latInput.addEventListener('input', latLonChanged, true);
    enableLongPress(latInput, () => { copyLatLonToClipboard(latInput); });
    enableMessageBubble(latInput);
    lngInput = document.getElementById('lng');
    lngInput.value = center.lng;
    lngInput.addEventListener('input', latLonChanged, true);
    enableLongPress(lngInput, () => { copyLatLonToClipboard(lngInput); });
    enableMessageBubble(lngInput);
    olcOutput = document.getElementById('olc');
    enableLongPress(olcOutput, copyOLC2ToClipboard);
    enableMessageBubble(olcOutput);
    geocodingCheckbox = document.getElementById('geocoding');
    geocodingEnabled = geocoding;
    geocodingCheckbox.addEventListener('change', () => { updateState(); });
    window.addEventListener('hashchange', evaluateHash, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    initMap(center, zoom, mapTypeId);
  };

  window.addEventListener('load', main);
})(window);
