import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from './useSocket';

export function useX32(faders, bus) {
  const { emit, on } = useSocket();
  const [levels, setLevels] = useState({});
  const [x32Status, setX32Status] = useState({ connected: false });
  const [channelNames, setChannelNames] = useState({}); // channel# → X32 name
  const [busNames, setBusNames] = useState({}); // bus# → X32 name
  const [busMasterLevel, setBusMasterLevelState] = useState(0.75);
  const [mutes, setMutes] = useState({}); // channel# → 1 (active) | 0 (muted)
  const [eqParams, setEqParams] = useState({}); // `${ch}_${band}_${param}` → value
  const [dynParams, setDynParams] = useState({}); // `${ch}_${param}` → value
  const [gateParams, setGateParams] = useState({}); // `${ch}_${param}` → value
  const [busEqParams, setBusEqParams] = useState({}); // `${bus}_${band}_${param}` → value
  const [busDynParams, setBusDynParams] = useState({}); // `${bus}_${param}` → value
  const [busGateParams, setBusGateParams] = useState({}); // `${bus}_${param}` → value
  const [sendLevels, setSendLevels] = useState({}); // `${ch}_${bus}` → level (covers all buses)
  const [sendOns, setSendOns] = useState({}); // `${ch}_${bus}` → 0|1
  const [meterLevels, setMeterLevels] = useState([]); // index 0 = ch1, index 31 = ch32
  const busRef = useRef(bus);
  busRef.current = bus;

  useEffect(() => {
    const offStatus = on('x32:status', (status) => setX32Status(status));
    const offFader = on('x32:fader', ({ channel, bus: b, level }) => {
      setLevels(prev => ({ ...prev, [`${channel}_${b}`]: level }));
      setSendLevels(prev => ({ ...prev, [`${channel}_${b}`]: level }));
    });
    const offName = on('x32:channelName', ({ channel, name }) => {
      setChannelNames(prev => ({ ...prev, [channel]: name }));
    });
    const offBusName = on('x32:busName', ({ bus, name }) => {
      setBusNames(prev => ({ ...prev, [bus]: name }));
    });
    const offBusMaster = on('x32:busMaster', ({ bus: b, level }) => {
      if (b === busRef.current) setBusMasterLevelState(level);
    });
    const offMute = on('x32:mute', ({ channel, on: onVal }) => {
      setMutes(prev => ({ ...prev, [channel]: onVal }));
    });
    const offEq = on('x32:eq', ({ channel, band, param, value }) => {
      setEqParams(prev => ({ ...prev, [`${channel}_${band}_${param}`]: value }));
    });
    const offDyn = on('x32:dyn', ({ channel, param, value }) => {
      setDynParams(prev => ({ ...prev, [`${channel}_${param}`]: value }));
    });
    const offBusEq = on('x32:busEq', ({ bus, band, param, value }) => {
      setBusEqParams(prev => ({ ...prev, [`${bus}_${band}_${param}`]: value }));
    });
    const offBusDyn = on('x32:busDyn', ({ bus, param, value }) => {
      setBusDynParams(prev => ({ ...prev, [`${bus}_${param}`]: value }));
    });
    const offBusGate = on('x32:busGate', ({ bus, param, value }) => {
      setBusGateParams(prev => ({ ...prev, [`${bus}_${param}`]: value }));
    });
    const offGate = on('x32:gate', ({ channel, param, value }) => {
      setGateParams(prev => ({ ...prev, [`${channel}_${param}`]: value }));
    });
    const offSendOn = on('x32:sendOn', ({ channel, bus: b, on: onVal }) => {
      setSendOns(prev => ({ ...prev, [`${channel}_${b}`]: onVal }));
    });
    const offMeters = on('x32:meters', ({ channels }) => {
      setMeterLevels(channels);
    });

    emit('status:request');

    return () => {
      offStatus(); offFader(); offName(); offBusName(); offBusMaster();
      offMute(); offEq(); offDyn(); offBusEq(); offBusDyn(); offBusGate(); offGate(); offSendOn(); offMeters();
    };
  }, [on, emit]);

  // Request fader state + bus master level whenever bus or faders change
  useEffect(() => {
    if (faders && faders.length > 0) {
      emit('x32:requestState', { faders, bus });
    }
    emit('x32:getBusMaster', { bus });
  }, [faders, bus, emit]);

  const setFader = useCallback((channel, level) => {
    const key = `${channel}_${busRef.current}`;
    setLevels(prev => ({ ...prev, [key]: level }));
    emit('x32:setFader', { channel, bus: busRef.current, level });
  }, [emit]);

  const setBusMaster = useCallback((level) => {
    setBusMasterLevelState(level);
    emit('x32:setBusMaster', { bus: busRef.current, level });
  }, [emit]);

  const getLevel = useCallback((channel) => {
    return levels[`${channel}_${busRef.current}`] ?? 0.75;
  }, [levels]);

  const setMute = useCallback((channel, muted) => {
    setMutes(prev => ({ ...prev, [channel]: muted ? 0 : 1 }));
    emit('x32:setMute', { channel, muted });
  }, [emit]);

  const isMuted = useCallback((channel) => {
    // on=1 means active (not muted), on=0 means muted; undefined → assume active
    const val = mutes[channel];
    return val === 0;
  }, [mutes]);

  const requestChannelDetail = useCallback((channel) => {
    emit('x32:requestChannelDetail', { channel });
  }, [emit]);

  const requestBusDetail = useCallback((bus) => {
    emit('x32:requestBusDetail', { bus });
  }, [emit]);

  const setEqParam = useCallback((channel, band, param, value) => {
    setEqParams(prev => ({ ...prev, [`${channel}_${band}_${param}`]: value }));
    emit('x32:setEqParam', { channel, band, param, value });
  }, [emit]);

  const getEqParam = useCallback((channel, band, param) => {
    return eqParams[`${channel}_${band}_${param}`];
  }, [eqParams]);

  const setBusEqParam = useCallback((bus, band, param, value) => {
    setBusEqParams(prev => ({ ...prev, [`${bus}_${band}_${param}`]: value }));
    emit('x32:setBusEqParam', { bus, band, param, value });
  }, [emit]);

  const getBusEqParam = useCallback((bus, band, param) => {
    return busEqParams[`${bus}_${band}_${param}`];
  }, [busEqParams]);

  const setDynParam = useCallback((channel, param, value) => {
    setDynParams(prev => ({ ...prev, [`${channel}_${param}`]: value }));
    emit('x32:setDynParam', { channel, param, value });
  }, [emit]);

  const getDynParam = useCallback((channel, param) => {
    return dynParams[`${channel}_${param}`];
  }, [dynParams]);

  const setBusDynParam = useCallback((bus, param, value) => {
    setBusDynParams(prev => ({ ...prev, [`${bus}_${param}`]: value }));
    emit('x32:setBusDynParam', { bus, param, value });
  }, [emit]);

  const getBusDynParam = useCallback((bus, param) => {
    return busDynParams[`${bus}_${param}`];
  }, [busDynParams]);

  const setGateParam = useCallback((channel, param, value) => {
    setGateParams(prev => ({ ...prev, [`${channel}_${param}`]: value }));
    emit('x32:setGateParam', { channel, param, value });
  }, [emit]);

  const getGateParam = useCallback((channel, param) => {
    return gateParams[`${channel}_${param}`];
  }, [gateParams]);

  const setBusGateParam = useCallback((bus, param, value) => {
    setBusGateParams(prev => ({ ...prev, [`${bus}_${param}`]: value }));
    emit('x32:setBusGateParam', { bus, param, value });
  }, [emit]);

  const getBusGateParam = useCallback((bus, param) => {
    return busGateParams[`${bus}_${param}`];
  }, [busGateParams]);

  const getSendLevel = useCallback((channel, busNum) => {
    return sendLevels[`${channel}_${busNum}`] ?? 0;
  }, [sendLevels]);

  const setSendLevel = useCallback((channel, busNum, level) => {
    setSendLevels(prev => ({ ...prev, [`${channel}_${busNum}`]: level }));
    emit('x32:setFader', { channel, bus: busNum, level });
  }, [emit]);

  const getSendOn = useCallback((channel, busNum) => {
    return sendOns[`${channel}_${busNum}`] ?? 1;
  }, [sendOns]);

  const getMeterLevel = useCallback((channel) => {
    return meterLevels[channel - 1] ?? 0;
  }, [meterLevels]);

  return {
    setFader, getLevel, setBusMaster, busMasterLevel,
    x32Status, channelNames, busNames,
    setMute, isMuted, mutes,
    requestChannelDetail, requestBusDetail,
    setEqParam, getEqParam, eqParams,
    setBusEqParam, getBusEqParam, busEqParams,
    setDynParam, getDynParam, dynParams,
    setBusDynParam, getBusDynParam, busDynParams,
    setGateParam, getGateParam, gateParams,
    setBusGateParam, getBusGateParam, busGateParams,
    getSendLevel, setSendLevel, getSendOn, sendLevels,
    getMeterLevel,
  };
}
