'use strict';
let runTests = () => {
  let conversions = [
    {
      extra: true,
      geo: {
        lon: 9.809641,
        lat: 52.385863
      },
      olc: '9F4F9RP5+8VR'
    },
    {
      extra: true,
      geo: {
        lon: 9.809672,
        lat: 52.385863
      },
      olc: '9F4F9RP5+8VV'
    },
    {
      extra: true,
      geo: {
        lon: 9.809703,
        lat: 52.385863
      },
      olc: '9F4F9RP5+8VW'
    },
    {
      extra: true,
      geo: {
        lon: 9.809734,
        lat: 52.385863
      },
      olc: '9F4F9RP5+8VX'
    },
    {
      extra: true,
      geo: {
        lon: 9.809641,
        lat: 52.385838
      },
      olc: '9F4F9RP5+8VJ'
    },
    {
      extra: true,
      geo: {
        lon: 9.809672,
        lat: 52.385838
      },
      olc: '9F4F9RP5+8VM'
    },
    {
      extra: true,
      geo: {
        lon: 9.809703,
        lat: 52.385838
      },
      olc: '9F4F9RP5+8VP'
    },
    {
      extra: true,
      geo: {
        lon: 9.809734,
        lat: 52.385838
      },
      olc: '9F4F9RP5+8VQ'
    },
    {
      extra: true,
      geo: {
        lon: 9.809641,
        lat: 52.385812
      },
      olc: '9F4F9RP5+8VC'
    },
    {
      extra: true,
      geo: {
        lon: 9.809672,
        lat: 52.385812
      },
      olc: '9F4F9RP5+8VF'
    },
    {
      extra: true,
      geo: {
        lon: 9.809703,
        lat: 52.385812
      },
      olc: '9F4F9RP5+8VG'
    },
    {
      extra: true,
      geo: {
        lon: 9.809734,
        lat: 52.385812
      },
      olc: '9F4F9RP5+8VH'
    },
    {
      extra: true,
      geo: {
        lon: 9.809641,
        lat: 52.385787
      },
      olc: '9F4F9RP5+8V6'
    },
    {
      extra: true,
      geo: {
        lon: 9.809672,
        lat: 52.385787
      },
      olc: '9F4F9RP5+8V7'
    },
    {
      extra: true,
      geo: {
        lon: 9.809703,
        lat: 52.385787
      },
      olc: '9F4F9RP5+8V8'
    },
    {
      extra: true,
      geo: {
        lon: 9.809734,
        lat: 52.385787
      },
      olc: '9F4F9RP5+8V9'
    },
    {
      extra: true,
      geo: {
        lon: 9.809641,
        lat: 52.385762
      },
      olc: '9F4F9RP5+8V2'
    },
    {
      extra: true,
      geo: {
        lon: 9.809672,
        lat: 52.385762
      },
      olc: '9F4F9RP5+8V3'
    },
    {
      extra: true,
      geo: {
        lon: 9.809703,
        lat: 52.385762
      },
      olc: '9F4F9RP5+8V4'
    },
    {
      extra: true,
      geo: {
        lon: 9.809734,
        lat: 52.385762
      },
      olc: '9F4F9RP5+8V5'
    }
  ];
  conversions.forEach(v => {
    let olc = OLC.encode(v.geo.lat, v.geo.lon, v.extra ? OLC.PRECISION_EXTRA : OLC.PRECISION_NORMAL);
    console.log('encode', v.olc, v.geo.lat, v.geo.lon, olc, v.olc === olc);
  });
  conversions.forEach(v => {
    let geo = OLC.decode(v.olc);
    console.log('decode', v.olc, v.geo.lat, v.geo.lon,geo.lat, geo.lon,  v.geo.lat.toFixed(6) === geo.lat.toFixed(6) && v.geo.lon.toFixed(6) === geo.lon.toFixed(6));
  });
};
