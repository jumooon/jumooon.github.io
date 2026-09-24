const assert=require('node:assert/strict');
const A=require('../dist/astronomy.browser.min.js');
const api=require('../dist/sun-times.js')(A);
const now=new Date('2026-09-18T22:00:00Z'),data=api.getSnapshot(now);
assert.deepEqual(data.cities.map(c=>c.date),['2026-09-19','2026-09-18']);
assert.strictEqual(api.getSnapshot(new Date('2026-09-18T22:01:00Z')),data);
for(const c of data.cities){
  assert(Date.parse(c.sunrise.utc)>=Date.parse(c.dayStartUtc));
  assert(Date.parse(c.sunset.utc)<Date.parse(c.dayEndUtc));
  assert(c.daylightSeconds>0);
}
const next=api.getSnapshot(new Date(data.nextUpdateAt));
assert.strictEqual(next.cities[0],data.cities[0],'Only the city crossing midnight recalculates');
assert.equal(next.cities[1].date,'2026-09-19');
for(const [instant,hours] of [['2026-03-08T12:00:00Z',23],['2026-11-01T12:00:00Z',25]]){
  const sd=api.getSnapshot(new Date(instant)).cities[1];
  assert.equal((Date.parse(sd.dayEndUtc)-Date.parse(sd.dayStartUtc))/3600000,hours);
  assert(sd.sunrise&&sd.sunset);
}
assert.equal(api.getSnapshot(new Date('2027-01-01T04:00:00Z')).cities[0].date,'2027-01-01');
assert(Object.isFrozen(data.cities[0].sunrise));
console.log('PASS: local dates, sunrise/sunset bounds, daily cache rollover, DST 23/25-hour days, year rollover');
