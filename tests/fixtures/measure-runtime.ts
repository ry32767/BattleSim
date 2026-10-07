import { content, defaultRoster, maps } from '@battle/content';
import { compileMatch, createFixedPlans, initializeHashing, resolveTurn } from '@battle/engine';
import { writeFileSync } from 'node:fs';
const report:Record<string,unknown>={environment:'local Windows, isolated measured run',ruleVersion:'R1.3',contentVersion:content.version};
await initializeHashing();
for(const stage of ['I','II','III'] as const){const start=performance.now(),state=compileMatch(maps[stage],content,{A:defaultRoster(stage,'A'),B:defaultRoster(stage,'B')},319),compileMs=Math.round(performance.now()-start),plans=[...createFixedPlans(state,'A',content),...createFixedPlans(state,'B',content)],begin=performance.now(),result=resolveTurn(state,plans,content),resolveMs=Math.round(performance.now()-begin);report[stage]={bodies:state.units.length,compileMs,resolveMs,underOneSecond:resolveMs<1000,frames:result.frames.length,events:result.fullEvents.length};}
writeFileSync('tests/fixtures/runtime-performance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
