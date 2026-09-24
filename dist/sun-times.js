/* Data only: local civil-day sunrise/sunset. No UI or network requests.
   Astronomy Engine uses solar-disc/refraction corrections, unlike a simple
   crossing of the Sun centre through altitude zero. Terrain/weather excluded. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else if(root.Astronomy){
    const api=factory(root.Astronomy);
    root.CitySunTimes=api;
    let timer;
    function refresh(){
      clearTimeout(timer);
      const data=api.getSnapshot();
      if(refresh.previous!==data){
        refresh.previous=data;
        root.dispatchEvent(new CustomEvent('sun-times:update',{detail:data}));
      }
      // Midnight in either city, with an hourly safety check for clock changes.
      if(!document.hidden)timer=setTimeout(refresh,Math.max(1,Math.min(3600000,Date.parse(data.nextUpdateAt)-Date.now())));
    }
    document.addEventListener('visibilitychange',refresh);
    root.addEventListener('pageshow',refresh);
    refresh();
  }
})(typeof window==='undefined'?null:window,function(A){
  'use strict';
  const cities=[
    {id:'busan',name:'Busan',latitude:35.18,longitude:129.08,timeZone:'Asia/Seoul'},
    {id:'sandiego',name:'San Diego',latitude:32.72,longitude:-117.16,timeZone:'America/Los_Angeles'}
  ];
  const dateFormats=new Map(),timeFormats=new Map(),cache=new Map();
  let snapshot;
  for(const c of cities){
    dateFormats.set(c.id,new Intl.DateTimeFormat('en-CA',{timeZone:c.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
    timeFormats.set(c.id,new Intl.DateTimeFormat('en-GB',{timeZone:c.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
  }
  function parts(date,c){return Object.fromEntries(dateFormats.get(c.id).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))}
  function dateKey(date,c){const p=parts(date,c);return `${p.year}-${p.month}-${p.day}`}
  function midnight(key,c){
    const target=Date.parse(key+'T00:00:00Z');let instant=target;
    for(let i=0;i<4;i++){
      const p=parts(new Date(instant),c);
      const local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
      const delta=target-local;if(!delta)break;instant+=delta;
    }
    return instant;
  }
  function day(key,c){
    const start=midnight(key,c);
    const nextKey=new Date(Date.parse(key+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    const end=midnight(nextKey,c),observer=new A.Observer(c.latitude,c.longitude,10);
    function event(direction){
      const hit=A.SearchRiseSet('Sun',observer,direction,new Date(start),(end-start)/86400000);
      if(!hit||hit.date.getTime()<start||hit.date.getTime()>=end)return null;
      return Object.freeze({utc:hit.date.toISOString(),localTime:timeFormats.get(c.id).format(hit.date)});
    }
    const sunrise=event(1),sunset=event(-1);
    return Object.freeze({...c,date:key,dayStartUtc:new Date(start).toISOString(),dayEndUtc:new Date(end).toISOString(),sunrise,sunset,
      daylightSeconds:sunrise&&sunset?Math.round((Date.parse(sunset.utc)-Date.parse(sunrise.utc))/1000):null});
  }
  function getSnapshot(now=new Date()){
    const rows=cities.map(c=>{
      const key=dateKey(now,c),prior=cache.get(c.id);
      if(prior?.date===key)return prior;
      const entry=day(key,c);cache.set(c.id,entry);return entry;
    });
    if(snapshot&&rows.every((row,i)=>row===snapshot.cities[i]))return snapshot;
    snapshot=Object.freeze({schemaVersion:1,computedAt:now.toISOString(),source:'Astronomy Engine (bundled local calculation)',
      assumptions:'City coordinates; observer elevation 10 m; ideal horizon; no terrain or weather correction. localTime is HH:mm, seconds omitted.',
      nextUpdateAt:new Date(Math.min(...rows.map(r=>Date.parse(r.dayEndUtc)))).toISOString(),cities:Object.freeze(rows)});
    return snapshot;
  }
  return Object.freeze({getSnapshot});
});
