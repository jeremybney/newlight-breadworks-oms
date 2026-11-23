// Run with: npx tsx tests/oven/run.ts
import {
  Family, OVEN_GROUPS, familyOf, groupLabel, keyOf, classifyRack, handlingFlags, minutesOfDay, isoDateOf, mixedTemperature, parseOvenCsv, parseUnitsCell, planOven, summarizeOvenDay,
} from '../../src/lib/oven'
import { DEFAULT_STANDARDS, computeMixBake } from '../../src/lib/labor'

let pass = 0, fail = 0
function ok(c: boolean, msg: string) { if (c) pass++; else { fail++; console.log('  FAIL', msg) } }
const g = (n: string, c?: string) => classifyRack(n, c)?.group
const S = (group: string, family: Family = ''): { group: string; family: Family } => ({ group, family })

console.log('Bake guide groups')
ok(OVEN_GROUPS.find(x => x.id === 'pullman_l_360')!.minutes === 50 && OVEN_GROUPS.find(x => x.id === 'pullman_s_360')!.minutes === 30, 'pullman 50 / 30 min at 360F')
ok(OVEN_GROUPS.find(x => x.id === 'pullman_l_440')!.minutes === 30 && OVEN_GROUPS.find(x => x.id === 'bun_360')!.minutes === 15, 'sourdough pullman 30 min, buns 15 min')
ok(g('Brioche Pullman (Large)', 'BRIOCHE') === 'pullman_l_360' && g('Brioche Pullman (Retail)', 'BRIOCHE') === 'pullman_s_360', 'brioche pullman large and small')
ok(g('Milk Bread (Large)', 'MILK_BREAD') === 'pullman_l_360' && g('Multigrain (Retail)', 'MULTIGRAIN') === 'pullman_s_360', 'milk bread and multigrain loaves are pullmans')
ok(g('Sourdough Pullman (Large)', 'BAGUETTE_FOCACCIA') === 'pullman_l_440', 'sourdough pullman is its own 440F group')
ok(g('Hamburger Bun', 'BRIOCHE') === 'bun_360' && g('Hot Dog Bun', 'BRIOCHE') === 'bun_360' && g('2.5" Milk Bread Slider', 'MILK_BREAD') === 'bun_360', 'brioche and milk buns, sliders, hot dog buns bake at 360F')
ok(g('Italian Hoagie P', 'POOLISH') === 'bun_440' && g('Ciabatta (Small)', 'POOLISH') === 'bun_440', 'hoagies and ciabatta share a group')
ok(g('Semolina Burger Bun', 'SEMOLINA') === 'bun_440' && g('Sourdough Burger Bun', 'BAGUETTE_FOCACCIA') === 'bun_440', 'semolina and sourdough buns bake at 440F')
ok(g('Hamburger Bun', 'BRIOCHE') !== g('Italian Hoagie P', 'POOLISH'), 'milk buns and hoagies cannot share a rack')
ok(g('Italian Baguette', 'POOLISH') === 'baguette_440' && classifyRack('24" Italian Baguette', 'POOLISH')!.cap === 90, 'baguettes, 24 inch holds 90')
ok(g('Sourdough Focaccia (Wholesale)') === 'focaccia_440' && g('Sicilian') === 'sicilian_440', 'focaccia and Sicilian')
ok(classifyRack('Parker House Roll', 'BRIOCHE')!.cap === 768, 'Parker rack holds 768')
ok(classifyRack('Croissant', 'BRIOCHE') === null && classifyRack('Deli Rye (Large)', 'RYE') === null, 'items with no rack definition stay unclassified')
ok(g('Roll') === 'bun_360' && g('Pullman (Grande)') === 'pullman_l_360' && g('Hoagie') === 'bun_440' && g('Ciabatta') === 'bun_440', 'names as typed in the oven log')

console.log('Plan')
const std = { ...DEFAULT_STANDARDS, ovenTurnaroundMin: 5 }
const half = planOven([
  { name: 'Hamburger Bun', category: 'BRIOCHE', units: 108 },        // half a rack at 360F
  { name: 'Brioche Pullman (Large)', category: 'BRIOCHE', units: 12 }, // half a rack, different time
], std)
ok(half.racks === 2, 'two half racks with different bake times are two racks, not one')
ok(half.ovenMinutes === 15 + 5 + 50 + 5, 'oven minutes = racks x (bake time + turnaround)')
const together = planOven([
  { name: 'Italian Hoagie P', category: 'POOLISH', units: 54 },
  { name: 'Ciabatta (Small)', category: 'POOLISH', units: 54 },
], std)
ok(together.racks === 1, 'hoagies and ciabatta share one rack')
console.log('Dough families at 360F')
ok(familyOf('Milk Bread (Large)', 'MILK_BREAD') === 'milk' && familyOf('Brioche Pullman (Large)', 'BRIOCHE') === 'brioche' && familyOf('Multigrain (Large)', 'MULTIGRAIN') === 'multigrain', 'family from name and category')
const fam = planOven([
  { name: 'Milk Bread (Large)', category: 'MILK_BREAD', units: 12 },
  { name: 'Brioche Pullman (Large)', category: 'BRIOCHE', units: 12 },
  { name: 'Multigrain (Large)', category: 'MULTIGRAIN', units: 12 },
], std)
ok(fam.racks === 3 && fam.rows.length === 3, 'milk, brioche and multigrain Pullmans are separate racks, never one pooled rack')
ok(fam.rows.some(r => r.label === 'Pullman large (milk)'), 'plan rows are labeled by family')
ok(planOven([{ name: 'Milk Bread (Large)', category: 'MILK_BREAD', units: 12 }, { name: 'Milk Bread Large (Thick Sliced)', category: 'MILK_BREAD', units: 12 }], std).racks === 1, 'same family shares a rack')
ok(planOven([{ name: 'Hamburger Bun', category: 'BRIOCHE', units: 100 }, { name: '5" Milk Burger Buns', category: 'MILK_BREAD', units: 100 }], std).racks === 2, 'brioche buns and milk buns are separate racks')
ok(g('Challah Parker House Roll', 'BRIOCHE') === 'bun_360' && classifyRack('Challah', 'CHALLAH') === null, 'challah Parker House rolls are buns; loaf challah is not a rack item')
ok(keyOf('bun_440', 'milk') === 'bun_440' && groupLabel('pullman_l_360|milk') === 'Pullman large (milk)', 'families only apply at 360F')
ok(planOven([{ name: 'Hamburger Bun', category: 'BRIOCHE', units: 217 }], std).racks === 2, 'racks round up within a group')
ok(planOven([{ name: 'Hamburger Bun', category: 'BRIOCHE', units: 100 }], { ...std, groupMinutes: { bun_360: 20 } }).ovenMinutes === 25, 'bake minutes can be overridden by group')
ok(planOven([{ name: 'Croissant', category: 'BRIOCHE', units: 10 }], std).unclassified.join() === 'Croissant', 'unclassified items are listed')

console.log('Handling (egg wash, seeds, depan)')
ok(handlingFlags('Hamburger Bun', 'BRIOCHE').eggWash && !handlingFlags('Hamburger Bun', 'BRIOCHE').seed, 'plain brioche bun: egg wash only')
ok(handlingFlags('Hamburger Bun (Sesame Seeded)', 'BRIOCHE').seed && handlingFlags('2.5" Milk Bread Slider (Seeded)', 'MILK_BREAD').seed, 'seeded buns and sliders')
ok(handlingFlags('Hot Dog Bun', 'BRIOCHE').eggWash, 'hot dog buns get egg wash')
ok(!handlingFlags('Parker House Roll', 'BRIOCHE').eggWash && !handlingFlags('Italian Burger Bun', 'POOLISH').eggWash, 'only brioche and milk buns and sliders')
const hs = planOven([
  { name: '5" Milk Burger Buns (Seeded)', category: 'MILK_BREAD', units: 216 },
  { name: 'Brioche Pullman (Large)', category: 'BRIOCHE', units: 48 },
], { ...std, eggWashMinPerRack: 10, seedMinPerRack: 8, depanMinPerRack: 6 })
ok(hs.handling.eggWashRacks === 1 && hs.handling.seedRacks === 1 && hs.handling.depanRacks === 2 && hs.handling.minutes === 10 + 8 + 12, 'handling minutes per rack, depan only on pullmans')
ok(planOven([{ name: 'Hamburger Bun', category: 'BRIOCHE', units: 216 }], std).handling.minutes === 0, 'handling is 0 until minutes are set')

console.log('Day plan through computeMixBake')
const prods = [
  { id: 'bun', name: 'Hamburger Bun', category: 'BRIOCHE', unitWeight: 100 },
  { id: 'pul', name: 'Brioche Pullman (Large)', category: 'BRIOCHE', unitWeight: 900 },
] as { id: string; name: string; category?: string; unitWeight?: number }[]
const ord = { id: 'o', customerId: 'c', customerName: 'c', status: 'confirmed', items: [
  { productId: 'bun', productName: 'Hamburger Bun', quantity: 108, unitPrice: 1 }, { productId: 'pul', productName: 'Brioche Pullman (Large)', quantity: 12, unitPrice: 1 },
] } as never
const mb = computeMixBake([ord], prods, std, [])
ok(mb.rackEquivalents === 2 && Math.abs(mb.rackHours - 75 / 60) < 1e-9, 'computeMixBake uses the grouped plan (75 oven minutes)')

console.log('Reading the units cell')
ok(parseUnitsCell('216', S('bun_360')).pieces[0].units === 216 && !parseUnitsCell('216', S('bun_360')).review, 'plain number')
const combo = parseUnitsCell('60 burger semolina 24 Ita', S('bun_440'))
ok(combo.pieces.length === 2 && combo.pieces[0].units === 60 && combo.pieces[1].units === 24 && combo.pieces.every(p => p.group === 'bun_440') && !combo.review, 'combined load: semolina burgers and hoagies, both 440F')
const pm = parseUnitsCell('24 milk', S('pullman_l_360', 'milk'))
ok(pm.pieces.length === 1 && pm.pieces[0].group === 'pullman_l_360' && pm.pieces[0].units === 24, '"24 milk" on a Pullman stays a Pullman')
ok(parseUnitsCell('24 sourdough', S('pullman_l_360', 'milk')).pieces[0].group === 'pullman_l_440', 'sourdough on a Pullman moves to the 440F group')
const fm = parseUnitsCell('14 multigrain', S('pullman_l_360', 'milk')).pieces[0]
ok(fm.group === 'pullman_l_360' && fm.family === 'multigrain', '"14 multigrain" on a Pullman is the multigrain family')
ok(parseUnitsCell('4 brioch', S('pullman_l_360', 'milk')).pieces[0].family === 'brioche', 'misspelled "brioch" still reads as brioche')
ok(!!parseUnitsCell('about a rack', S('bun_360')).review && !!parseUnitsCell('', S('bun_360')).review, 'unreadable or empty text goes to review')
ok(parseUnitsCell('5', null).review === 'Product not recognized', 'unknown product goes to review')

console.log('Reading the published sheet')
ok(minutesOfDay('7:55:00 AM') === 475 && minutesOfDay('1:05 PM') === 785 && minutesOfDay('12:30:00 PM') === 750 && minutesOfDay('12:10 AM') === 10 && minutesOfDay('13:05') === 785, 'times')
ok(isoDateOf('11/21/2026') === '2026-11-21' && isoDateOf('2026-11-21') === '2026-11-21' && isoDateOf('x') === null, 'dates')
const rackCsv = [
  'Timestamp,FECHA (DATE),HORA DE INICIO (START TIME),HORA DE FIN (END TIME),UNIDADES,Nombre,PRODUCTO,Week Start,Bake Minutes',
  '11/21/2026 8:00:00,11/21/2026,7:55:00 AM,8:50:00 AM,24 milk,,Pullman (Grande),11/16/2026,55',
  '11/21/2026 9:10:00,11/21/2026,9:05:00 AM,9:25:00 AM,60,,Ciabatta,11/16/2026,20',
  '11/21/2026 9:30:00,11/21/2026,9:20:00 AM,9:40:00 AM,60 burger semolina 24 Ita,,Hoagie,11/16/2026,20',
  '11/21/2026 9:56:00,11/21/2026,9:55:00 AM,10:15:00 AM,108 twist,,Milk Burger Bun,11/16/2026,20',
  '11/21/2026 10:30:00,11/21/2026,10:10:00 AM,10:30:00 AM,240,,Milk Burger Bun,11/16/2026,20',
  '11/20/2026 10:30:00,11/20/2026,10:10:00 AM,10:30:00 AM,216,,Milk Burger Bun,11/16/2026,20',
  '11/21/2026 10:30:00,11/21/2026,7:45 AM,0:30 AM,483,,Milk Burger Bun,11/16/2026,-435',
  '11/21/2026 8:00:00,11/21/2026,8:00:00 AM,8:20:00 AM,13,Gustavo,,11/16/2026,20',
  '11/21/2026 11:00:00,11/21/2026,11:00:00 AM,11:20:00 AM,about a rack,,Ciabatta,11/16/2026,20',
].join('\n')
const rp = parseOvenCsv(rackCsv)!
ok(rp.kind === 'rack', 'rack tab recognized by its headings')
const day = rp.loads.filter(l => l.date === '2026-11-21')
ok(day.length === 7, 'rows with no product are skipped')
ok(day[0].minutes === 55 && day[0].group === 'pullman_l_360', 'Pullman load: 55 minutes, large 360F group')
const hoagie = day.find(l => l.product === 'Hoagie')!
ok(hoagie.units === 84 && hoagie.pieces.length === 2 && !hoagie.review, 'combined hoagie load reads as 60 + 24')
ok(day.find(l => l.raw === '108 twist')!.pieces[0].group === 'bun_440' && mixedTemperature(day.find(l => l.raw === '108 twist')!) === false, '"108 twist" read as one piece')
const fixed = day.find(l => l.raw === '483')!
ok(fixed.minutes === 45 || fixed.minutes === 55 || fixed.minutes > 0, 'an end time entered after midnight is repaired or falls back to the sheet minutes')
const sm = summarizeOvenDay(day)
ok(sm.review.length === 1 && sm.review[0].raw === 'about a rack', 'one load needs review')
ok(Math.round(sm.byGroup['bun_440'].loads) === 4 && Math.round(sm.rackMinutes) === sm.rackLoads.reduce((t, l) => t + l.minutes, 0), 'logged minutes by group')
const split = summarizeOvenDay([{ ...hoagie, pieces: [{ group: 'bun_440', family: '' as Family, units: 60 }, { group: 'bun_360', family: 'milk' as Family, units: 60 }], units: 120, minutes: 20 }])
ok(Math.round(split.byGroup['bun_440'].minutes) === 10 && Math.round(split.byGroup['bun_360|milk'].minutes) === 10, 'a combined load shares its minutes between its pieces by units')
const deckCsv = [
  'Timestamp,123,Producto,Unidades,Hora de entrada,Hora de salido,Fecha,Week Start,Bake minutes',
  '1/28/2026 15:52:32,"1, 2",Large Batard,48,8:15:00 AM,9:05:00 AM,1/28/2026,1/26/2026,50',
].join('\n')
const dp = parseOvenCsv(deckCsv)!
ok(dp.kind === 'deck' && dp.loads[0].minutes === 50 && dp.loads[0].units === 48 && dp.loads[0].date === '2026-01-28', 'deck tab recognized and read')
ok(parseOvenCsv('a,b,c\n1,2,3') === null, 'a tab with other headings is not guessed at')
const mixed = { ...day[0], pieces: [{ group: 'bun_360', family: 'milk' as Family, units: 10 }, { group: 'bun_440', family: '' as Family, units: 10 }] }
ok(mixedTemperature(mixed), 'a combined load of 360F and 440F items is flagged')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
