// Seed data for the MyProfessionalMe prototype (verbatim from the Claude Design file).
import type { Learn, Mapping, Project, Test, CloudKey, CloudMeta, AvatarSpec, Signal, RagPreset, RagModel, Bundle, LearnMeta } from './types';

export const DOMAINS: [string, string, string][] = [
  ['tech','Job technical skills','Tech skills'],['acad','Academic background','Academic'],['pers','Personal growth','Personal'],
  ['prof','Professional skills','Prof. skills'],['ind','Industry & market','Industry'],['reg','Regulations','Regulation'],
  ['corp','Corporate functions','Corp. fn.'],['tec','Technology','Technol.'],['lead','Leadership','Leading']];
export const LEVELS = ['Foundation','Practitioner','Advanced','Expert','Thought leader'];
export const STAGES = ['Analyst','Consultant','Senior consultant','Manager','Senior manager','Director','Partner'];
export const BLS = ['Consulting','Audit','Tax & Legal'];
export const TARGET = [4,3,3,4,3,3,2,3,3];
// id,title,dom,lvl,format,source,hours,cpd,due,why (progress is per person, in Supabase)
export const LEARN: Learn[] = [
 ['L1','Operating model design','tech',3,'E-learning','Internal academy',6,0,'','Every senior in Consulting designs at least one operating model a year. This is the firm method, with the templates we use in proposals.'],
 ['L2','Value-chain cost modelling in Excel','tech',3,'E-learning','Coursera',8,0,'','Advised for seniors who run cost workstreams.'],
 ['L3','Target operating model casebook','tech',4,'Book','Perlego',10,0,'',''],
 ['L4','Transformation programme design','tech',4,'Classroom','Internal academy',16,0,'Mar 2027','Mandatory before the Manager promotion review. Two days in Brussels with a live programme case and a partner panel.'],
 ['L5','Corporate finance refresher','acad',3,'E-learning','edX',12,6,'',''],
 ['L6','Behavioural economics for advisors','acad',3,'Book','Perlego',7,0,'',''],
 ['L7','Feedback that lands','pers',2,'Game','Internal academy',1.5,0,'',''],
 ['L8','Resilience & energy management','pers',2,'Mentoring','Coaching',4,0,'','Four one-to-one sessions with a firm coach. Advised after the engagement-load survey.'],
 ['L9','Writing for executives','pers',3,'E-learning','Internal academy',3,0,'',''],
 ['L10','Structured problem solving','prof',3,'Classroom','Internal academy',14,8,'',''],
 ['L11','Client conversations simulator','prof',3,'Game','Internal academy',2,0,'','Branching conversation game. Your counsellor reviews your transcript before it counts.'],
 ['L12','Proposal craft: scoping & pricing','prof',4,'E-learning','Internal academy',5,4,'Jan 2027','Managers own proposals. Mandatory in all three business lines before the promotion review.'],
 ['L13','Belgian retail & wholesale landscape','ind',2,'Website','Internal academy',2,0,'',''],
 ['L14','Energy transition: market players','ind',3,'E-learning','Coursera',6,0,'',''],
 ['L15','Life sciences value chains','ind',3,'Book','O’Reilly',9,0,'',''],
 ['L16','Independence & ethics annual','reg',1,'E-learning','Internal academy',1,1,'',''],
 ['L17','GDPR for consultants','reg',2,'E-learning','Internal academy',1.5,1,'30 Nov 2026','Mandatory for everyone who handles client data. Renewed every two years.'],
 ['L18','CSRD essentials','reg',3,'Certification','ITAA',10,10,'','Sustainability reporting now shapes most Manager-level proposals. Counts for 10 ITAA or ACCA units.'],
 ['L19','EU AI Act in practice','reg',3,'E-learning','edX',4,0,'',''],
 ['L20','How finance closes the books','corp',1,'E-learning','Internal academy',2,0,'',''],
 ['L21','HR for non-HR: workforce planning','corp',2,'Website','Internal academy',2,0,'',''],
 ['L22','Procurement fundamentals','corp',2,'Book','Perlego',5,0,'',''],
 ['L23','Azure fundamentals AZ-900','tec',2,'Certification','Microsoft Learn',12,0,'','Advised for Consulting seniors: most transformation programmes now land on Azure, and clients expect you to read an architecture diagram.'],
 ['L24','Generative AI for client work','tec',2,'E-learning','Internal academy',3,0,'',''],
 ['L25','Data literacy: reading dashboards','tec',1,'Game','Internal academy',1,0,'',''],
 ['L26','Power BI for consultants','tec',3,'E-learning','Microsoft Learn',9,0,'',''],
 ['L27','Leading a workstream','lead',2,'Classroom','Internal academy',12,0,'Jun 2027','Mandatory before Manager. You lead a simulated workstream for three days with actors as the client team.'],
 ['L28','Coaching conversations','lead',3,'Mentoring','Coaching',6,0,'',''],
 ['L29','Managing up and across','lead',2,'Book','Perlego',6,0,'',''],
 ['L30','Inclusive leadership','lead',2,'E-learning','Internal academy',2,0,'',''],
 ['L31','Reading a Belgian annual account','acad',2,'E-learning','Internal academy',3,2,'',''],
 ['L32','Negotiating scope with procurement','prof',3,'Classroom','Internal academy',7,4,'',''],
 ['L33','Facilitating executive workshops','prof',3,'Classroom','Internal academy',8,0,'',''],
 ['L34','Sustainability strategy for industrials','ind',3,'E-learning','edX',10,6,'',''],
 ['L35','ESG data and reporting tooling','tec',3,'E-learning','Microsoft Learn',6,0,'',''],
 ['L36','Delegation and workload planning','lead',2,'E-learning','Internal academy',2,0,'',''],
 ['L37','Storytelling with data','pers',3,'Game','Internal academy',2,0,'',''],
 ['L38','Holding scope with a procurement director','prof',3,'Avatar','Avatar studio',1.5,0,'','A ten-minute spoken role-play with an AI avatar who reopens agreed scope. Three runs; the best one counts once it reaches 4 of 5 on every skill.'],
 ['L39','Giving hard feedback to a junior','lead',2,'Avatar','Avatar studio',1,0,'','Practise the conversation before you have it. The avatar is a capable analyst who missed two deadlines and does not see the problem.'],
 ['L40','Presenting a fee increase to a sceptical CFO','prof',4,'Avatar','Avatar studio',1.5,0,'','The avatar challenges every number. You are scored on clarity, calm and whether you protect the relationship.'],
 ['L41','Calming an escalating client call','pers',3,'Avatar','Avatar studio',1,0,'','']
];
export const MAPS0: Record<string, Mapping[]> = {
 'Consulting':[['L7','Analyst','mandatory'],['L16','Analyst','mandatory'],['L17','Analyst','mandatory'],['L20','Analyst','advised'],['L31','Analyst','advised'],['L10','Consultant','mandatory'],['L24','Consultant','mandatory'],['L30','Consultant','mandatory'],['L5','Consultant','advised'],['L13','Consultant','advised'],['L1','Senior consultant','mandatory'],['L2','Senior consultant','advised'],['L8','Senior consultant','advised'],['L11','Senior consultant','advised'],['L19','Senior consultant','advised'],['L23','Senior consultant','advised'],['L4','Manager','mandatory'],['L12','Manager','mandatory'],['L27','Manager','mandatory'],['L18','Manager','advised'],['L28','Manager','advised'],['L3','Senior manager','advised']],
 'Audit':[['L7','Analyst','mandatory'],['L16','Analyst','mandatory'],['L17','Analyst','mandatory'],['L31','Analyst','mandatory'],['L20','Analyst','advised'],['L10','Consultant','mandatory'],['L24','Consultant','mandatory'],['L30','Consultant','mandatory'],['L5','Consultant','mandatory'],['L13','Consultant','advised'],['L2','Senior consultant','mandatory'],['L23','Senior consultant','mandatory'],['L1','Senior consultant','advised'],['L8','Senior consultant','advised'],['L11','Senior consultant','advised'],['L19','Senior consultant','advised'],['L12','Manager','mandatory'],['L18','Manager','mandatory'],['L27','Manager','mandatory'],['L4','Manager','advised'],['L28','Manager','advised'],['L6','Senior manager','advised']],
 'Tax & Legal':[['L7','Analyst','mandatory'],['L16','Analyst','mandatory'],['L17','Analyst','mandatory'],['L31','Analyst','mandatory'],['L20','Analyst','advised'],['L24','Consultant','mandatory'],['L30','Consultant','mandatory'],['L5','Consultant','advised'],['L10','Consultant','advised'],['L18','Senior consultant','mandatory'],['L19','Senior consultant','mandatory'],['L2','Senior consultant','advised'],['L8','Senior consultant','advised'],['L15','Senior consultant','advised'],['L26','Senior consultant','advised'],['L12','Manager','mandatory'],['L27','Manager','mandatory'],['L28','Manager','advised'],['L22','Senior manager','advised']]
};
export const OUTCOMES: Record<string, string[]> = {
 tech:['Frame a client problem in the firm method within the first week','Build the deliverable with the standard templates','Defend the design choices in a steering committee'],
 acad:['Read the numbers behind a client story without help','Spot the assumption that breaks the model','Explain the concept to a client in two sentences'],
 pers:['Notice your own pattern before it costs you a week','Say the difficult thing early, in a way that lands','Keep energy across a long engagement'],
 prof:['Run the meeting rather than attend it','Turn a vague ask into a scoped, priced proposal','Leave the client clearer than you found them'],
 ind:['Name the five players that matter and what moves them','Read a sector regulation change as a client opportunity','Hold a first conversation with a sector CFO'],
 reg:['Know what you may and may not do with client data','Apply the rule to the engagement in front of you','Know when to call Risk before you act'],
 corp:['Understand how the client function you advise actually runs','Speak the language of the function head','Spot where consulting work lands in their calendar'],
 tec:['Read an architecture diagram and ask the right question','Build a working analysis without waiting for a data team','Judge a vendor demo with a sceptical eye'],
 lead:['Set a workstream up so it runs without you','Give feedback people act on','Grow one person a year, visibly']
};
export const FILL: Record<string, string> = { accepted:'#86BC25', 'in-progress':'#e0a100', submitted:'#2f7fc1', 'not-started':'#fff' };
export const STATE_LABEL: Record<string, string> = { accepted:'Completed', 'in-progress':'In progress', submitted:'Awaiting counsellor', 'not-started':'Not started' };
export const OB_TONE: Record<string, string> = { mandatory:'neutral', advised:'blue', chosen:'green', open:'muted' };
export const OB_LABEL: Record<string, string> = { mandatory:'Mandatory', advised:'Advised', chosen:'Chosen by me', open:'Open' };
export const HEAT = ['#eef0ec','#eef7dc','#c9e39a','#b7d58a','#86BC25','#4c7a10'];
export const PROGRAM_OF: Record<string, string> = { 'Internal academy':'Internal academy', Coursera:'Coursera / edX', edX:'Coursera / edX', ITAA:'Professional bodies', ACCA:'Professional bodies', 'Microsoft Learn':'Microsoft Learn', 'O’Reilly':'Books · O’Reilly, Perlego', Perlego:'Books · O’Reilly, Perlego', Coaching:'Mentoring / coaching' };
export const PROGRAMS: [string, string, string][] = [['Internal academy','synced 07:10 today','#86BC25'],['Coursera / edX','synced yesterday','#86BC25'],['Professional bodies','ACCA · ITAA · IBR/IRE · manual','#a0a69d'],['Microsoft Learn','synced 07:10 today','#86BC25'],['Books · O’Reilly, Perlego','synced 2 days ago','#e0a100'],['Mentoring / coaching','manual','#a0a69d']];
export const PUB: Record<string, [string, string]> = { L19:['clarification','Needs review'], L14:['clarification','Needs review'], L22:['not-started','Draft'] };
export const AV_SWATCHES: [string, string, string][] = [['#1a1d18','#fff','Ink'],['#86BC25','#10180a','Green'],['#2f7fc1','#fff','Blue'],['#8a5a8c','#fff','Plum'],['#4c7a10','#fff','Moss']];
export const AVATARS: Record<string, AvatarSpec> = {
 L38:{ persona:'Marc Verhoeven', role:'Procurement director, energy utility', initials:'MV', brief:'Polite, well prepared and relentless. Reopens scope that was agreed in the last steering committee.', skills:['Assertiveness','Clarity','Listening'], target:4, attempts:[] },
 L39:{ persona:'Noah Claes', role:'Analyst, eight months in', initials:'NC', brief:'Capable and well liked. Missed two deadlines and thinks the plan was unrealistic.', skills:['Directness','Empathy','Next steps'], target:4, attempts:[] },
 L40:{ persona:'Hilde Jacobs', role:'CFO, wholesale trader', initials:'HJ', brief:'Has read the engagement letter twice. Asks for the number behind every number.', skills:['Clarity','Calm','Relationship'], target:4, attempts:[] },
 L41:{ persona:'Pieter Wouters', role:'Operations director, logistics client', initials:'PW', brief:'A go-live slipped and he is under pressure from his own board.', skills:['Calm','Empathy','Ownership'], target:4, attempts:[] }
};
export const LEARN_BY: Record<string, Learn> = {}; LEARN.forEach((r) => { LEARN_BY[r[0]] = r; });
// Owning business line and status per learning; filled from the database (seed data: firm-wide, published).
export const LEARN_META: Record<string, LearnMeta> = {};
// The catalogue lives in Supabase. Loading it replaces LEARN, LEARN_BY and LEARN_META in place, so every module keeps its import.
export function setCatalogue(rows: [Learn, LearnMeta][]) {
  LEARN.splice(0, LEARN.length, ...rows.map((r) => r[0]));
  [LEARN_BY, LEARN_META].forEach((o) => Object.keys(o).forEach((k) => delete o[k]));
  rows.forEach(([r, m]) => { LEARN_BY[r[0]] = r; LEARN_META[r[0]] = m; });
}
// key, label, colour, canMand, who belongs, obligation policy, rule field
export const LENSES: [string, string, string, boolean, string, string, string][] = [
 ['bl','Business line','#1a1d18',true,'Everyone whose contract sits in the business line, at their current stage.','Mandatory or advised. Mandatory items need Learning Council sign-off before they publish.','business_line'],
 ['ind','Industry','#2f7fc1',true,'People with 300 or more charged hours in the sector over the last 12 months, from staffing data.','Mandatory or advised. Keep mandatory for sector regulation.','industry'],
 ['tec','Technology','#b5762a',true,'People who hold the skill tag, or charged hours on a project that uses the technology.','Mandatory or advised.','technology'],
 ['amb','Ambition','#4c7a10',false,'People who saved a matching ambition in My profile, matched on its text and domains.','Suggested only. Ambitions are personal and never create obligations.','ambition'],
 ['pro','Profile','#8a5a8c',false,'People who chose to share a personality profile with their counsellor. Unshared profiles are never read.','Suggested only. Personality data never makes a learning mandatory and never affects readiness.','profile']
];
// audience key, name, reach (people)
export const AUDS: Record<string, [string, string, number][]> = {
 bl: [['Consulting','Consulting',508],['Audit','Audit',412],['Tax & Legal','Tax & Legal',366]],
 ind: [['ind:energy','Energy & utilities',84],['ind:health','Healthcare',61],['ind:whole','Wholesale & retail',97],['ind:public','Public sector',73]],
 tec: [['tec:data','Data & Azure',118],['tec:sap','SAP',64],['tec:ai','Generative AI',142]],
 amb: [['amb:sust','Sustainability lead',47],['amb:people','People leader',88],['amb:expert','Deep specialist',59],['amb:bizdev','Business developer',36]],
 pro: [['pro:blue','Cool blue first',121],['pro:red','Fiery red first',74],['pro:green','Earth green first',96],['pro:yellow','Sunshine yellow first',83]]
};
export const AUD_INFO: Record<string, { lens: string; name: string; reach: number }> = {}; Object.keys(AUDS).forEach((l) => AUDS[l].forEach((a) => { AUD_INFO[a[0]] = { lens: l, name: a[1], reach: a[2] }; }));
// Share of an audience at each stage, for reach estimates (sums to 1).
export const STAGE_FR = [.19,.25,.26,.15,.08,.04,.03];
export const STG_SHORT = ['Analyst','Consultant','Senior','Manager','Sr manager','Director','Partner'];
export const AUD_MAPS0: Record<string, Mapping[]> = {
 'ind:energy':[['L14','Consultant','advised'],['L38','Senior consultant','advised'],['L34','Senior consultant','advised'],['L18','Senior consultant','mandatory']],
 'ind:health':[['L22','Consultant','advised']], 'ind:whole':[['L2','Senior consultant','advised']], 'ind:public':[],
 'tec:data':[['L23','Consultant','advised'],['L26','Consultant','advised'],['L35','Senior consultant','advised']], 'tec:sap':[], 'tec:ai':[],
 'amb:sust':[['L34','Senior consultant','advised'],['L35','Manager','advised']], 'amb:people':[['L36','Consultant','advised'],['L39','Senior consultant','advised'],['L28','Senior consultant','advised']], 'amb:expert':[], 'amb:bizdev':[['L12','Senior consultant','advised']],
 'pro:blue':[['L37','Senior consultant','advised']], 'pro:red':[], 'pro:green':[], 'pro:yellow':[]
};
export const SIGNALS: Signal[] = [
 { id:'S1', kind:'Gap', st:'clarification', op:{ op:'add', aud:'ind:energy', lid:'L32', stage:'Senior consultant', ob:'advised' }, evidence:'23 of 41 Senior-consultant evaluations in Energy & utilities this year mention scope being reopened by procurement. No Energy mapping covers negotiation.', quote:'“Let procurement reopen scope three times in workshops.” · Brabant Energy, Oct 2026' },
 { id:'S2', kind:'Load', st:'in-progress', op:{ op:'setOb', aud:'ind:energy', lid:'L18', stage:'Senior consultant', ob:'advised' }, evidence:'A Senior consultant in Energy & utilities stacks {mand} h of mandatory learning once the business-line path is added, against a 40 h budget. This item drives most of it.', quote:'' },
 { id:'S3', kind:'Gap', st:'clarification', op:{ op:'add', aud:'tec:data', lid:'L37', stage:'Consultant', ob:'advised' }, evidence:'People tagged Data & Azure are rated “Developing” on communication 1.7 times as often as the firm average in 2026 evaluations.', quote:'“Precise analysis, but the steering deck lost the room.” · wholesale client, Jun 2026' },
 { id:'S4', kind:'Gap', st:'clarification', op:{ op:'add', aud:'amb:people', lid:'L33', stage:'Senior consultant', ob:'advised' }, evidence:'Of 88 people who saved a people-leader ambition, 61% have never run a client workshop according to staffing records.', quote:'' },
 { id:'S5', kind:'Overlap', st:'submitted', op:{ op:'remove', aud:'ind:whole', lid:'L2', stage:'Senior consultant' }, evidence:'Value-chain cost modelling already reaches Senior consultants through the Consulting path, so people in Wholesale & retail receive it twice.', quote:'' },
 { id:'S6', kind:'Gap', st:'clarification', op:{ op:'add', aud:'pro:red', lid:'L28', stage:'Consultant', ob:'advised' }, evidence:'Among people who shared a fiery-red-first profile, evaluations mention listening or leaving room for others 2.1 times as often. Only shared profiles are counted.', quote:'' }
];
// Filled from the performance tool once it is connected; no seeded evaluations.
export const PROJECTS: Project[] = [];
// Personality test results are added by each person; none are seeded.
export const TESTS: Test[] = [];
export const CLOUD_META: Record<CloudKey, CloudMeta> = {
 proj:{ label:'Projects', long:'From project evaluations', laneLabel:'Project-led path', laneSub:'advice from your evaluations', color:'#2f7fc1', text:'#1d5a8f', wash:'rgba(47,127,193,.14)', anchor:3, frac:.55, screen:'projects', goLabel:'Open projects →' },
 pers:{ label:'Personality', long:'From personality profiles', laneLabel:'Personal style path', laneSub:'from your profiles', color:'#8a5a8c', text:'#6e4370', wash:'rgba(138,90,140,.14)', anchor:2, frac:.55, screen:'profile', goLabel:'Open profiles →' },
 amb:{ label:'Ambitions', long:'Toward your ambitions', laneLabel:'Ambition path', laneSub:'your ambitions and interests', color:'#4c7a10', text:'#3f6a0a', wash:'rgba(76,122,16,.14)', anchor:4, frac:.72, screen:'profile', goLabel:'Open ambitions →' }
};
export const KEYWORDS: [string, string, string][] = [['sustain','Sustainability','reg'],['data','Data analysis','tec'],['coach','Coaching others','lead'],['lead','Leading teams','lead'],['health','Healthcare clients','ind'],['abroad','Working abroad','pers'],['financ','Corporate finance','acad'],['writ','Writing','pers'],['negoti','Negotiation','prof'],['sell','Business development','prof'],['supply','Supply chains','tech'],['tax','Tax technology','reg']];
export const IMPORT_RESULTS: [string, string][] = [['Negotiation for consultants','Coursera · 6 h · Professional skills'],['Cloud economics for advisors','Coursera · 4 h · Technology'],['Supply chain analytics','edX · 10 h · Job technical skills']];

// ---------- Knowledge library (design v3; admin, in memory like the catalogue) ----------
export const KB_TYPES: Record<string, string> = { upload: 'Upload', sharepoint: 'SharePoint', confluence: 'Confluence', web: 'Website', lms: 'LMS course' };
export const TOPICS: [string, string, [string, string][]][] = [
 ['cons','Consulting methods',[['cons.opm','Operating models'],['cons.cost','Cost & performance'],['cons.prog','Programme delivery'],['cons.comm','Communication standards']]],
 ['tax','Tax & Legal',[['tax.cit','Corporate income tax'],['tax.intl','International tax'],['tax.vat','VAT & indirect tax'],['tax.legal','Legal & regulatory']]],
 ['ind','Industries',[['ind.energy','Energy & utilities'],['ind.whole','Wholesale & retail'],['ind.health','Healthcare'],['ind.public','Public sector']]],
 ['tec','Technology',[['tec.data','Data & analytics'],['tec.cloud','Cloud'],['tec.ai','Generative AI']]],
 ['ppl','People & leadership',[['ppl.fb','Feedback & coaching'],['ppl.fac','Facilitation'],['ppl.pers','Personality frameworks']]]
];
export const TOPIC_BY: Record<string, { group: string; groupLabel: string; label: string }> = {}; TOPICS.forEach((g) => g[2].forEach((tp) => { TOPIC_BY[tp[0]] = { group: g[0], groupLabel: g[1], label: tp[1] }; }));
export const RAG_PRESETS: Record<string, RagPreset> = {
 precise: { name:'Precise · cite everything', embed:'e5', chunk:'800', overlap:'10', topk:'5', hybrid:30, thresh:'0.70', rerank:true, gen:'sonnet', temp:'0', cite:'sentence' },
 broad: { name:'Broad exploration', embed:'te3', chunk:'1200', overlap:'20', topk:'8', hybrid:20, thresh:'0.55', rerank:false, gen:'sonnet', temp:'0.5', cite:'paragraph' },
 legal: { name:'Legal strict', embed:'e5', chunk:'400', overlap:'20', topk:'3', hybrid:70, thresh:'0.80', rerank:true, gen:'sonnet', temp:'0', cite:'sentence' },
 quick: { name:'Quick answers', embed:'e5', chunk:'400', overlap:'0', topk:'3', hybrid:40, thresh:'0.65', rerank:false, gen:'haiku', temp:'0.2', cite:'paragraph' }
};
export const RAG_OPTS: Record<string, [string, string][]> = {
 embed:[['e5','Multilingual E5 large · NL/FR/EN'],['te3','OpenAI text-embedding-3-large'],['voyage','Voyage 3']],
 chunk:[['400','400 tokens'],['800','800 tokens'],['1200','1,200 tokens']], overlap:[['0','None'],['10','10%'],['20','20%']],
 topk:[['3','3 passages'],['5','5 passages'],['8','8 passages'],['12','12 passages']], thresh:[['0.55','0.55 · loose'],['0.65','0.65'],['0.70','0.70'],['0.80','0.80 · strict']],
 gen:[['sonnet','Claude Sonnet'],['haiku','Claude Haiku'],['gpt41','Azure OpenAI GPT-4.1']], temp:[['0','0 · factual'],['0.2','0.2'],['0.5','0.5 · varied']],
 cite:[['sentence','Every sentence'],['paragraph','Every paragraph'],['optional','When available']]
};
export const ragOptLabel = (k: string, v: string) => ((RAG_OPTS[k].find((o) => o[0] === v) || [v, v])[1]);
export const mkModels = (keys: string[]): RagModel[] => keys.map((k, i) => Object.assign({ id: 'M' + k + i, def: i === 0 }, RAG_PRESETS[k]));
export const BUNDLES0: Bundle[] = [
 { id:'B1', name:'Operating model & cost methods', owner:'Consulting learning team', topic:'cons.opm', topics2:['cons.cost','ind.whole'], desc:'The firm methods for operating model design and cost-to-serve work. Use it for anything about how we structure consulting work.', access:'all', fresh:'12', status:'indexed', updated:'28 Oct 2026', usedBy:14,
   tags:['operating model','cost-to-serve','target state','wholesale'], sugg:[['logistics cost',86],['design principles',74]], models: mkModels(['precise','broad']),
   sources:[['Operating model design method v4','upload','2.1 MB',212,'28 Oct','internal'],['Cost-to-serve playbook','upload','1.4 MB',138,'28 Oct','internal'],['Delcroix engagement files','sharepoint','118 files',0,'27 Oct','client']],
   chunks:[[1,'Size the cost-to-serve model on the activities that vary by customer: order handling, picking, delivery drops and returns. Fixed overhead stays out of the allocation.'],[1,'Start with the top 20% of customers by volume; in most wholesale cases they explain 70 to 80% of variable logistics cost.'],[0,'An operating model has six layers: customers, services, processes, organisation, technology and governance. Change one and check the five others.'],[0,'Design the target state before the transition plan; agree three design principles with the client sponsor first.']],
   concepts:[['operating-model-layers','method','Operating model layers','The six layers every operating model covers.','Customers, services, processes, organisation, technology and governance. A change in one layer is checked against the other five before it is agreed.',['target-state-first'],['operating model'],[0]],['target-state-first','principle','Target state before transition','Design where you are going before planning the route.','Agree three design principles with the client sponsor, design the target state, then write the transition plan.',['operating-model-layers'],['target state'],[0]],['cost-to-serve-scope','method','Scoping a cost-to-serve model','Which activities to allocate and which to leave out.','Allocate only activities that vary by customer: order handling, picking, delivery drops and returns. Fixed overhead stays out.',['operating-model-layers'],['cost-to-serve'],[1]]] },
 { id:'B5', name:'Steering & storytelling standards', owner:'Consulting learning team', topic:'cons.comm', topics2:['ppl.fac'], desc:'How the firm writes steering decks and tells a story with data.', access:'all', fresh:'24', status:'indexed', updated:'27 Oct 2026', usedBy:18,
   tags:['steering committee','slides','storytelling'], sugg:[['executive summary',81]], models: mkModels(['precise']),
   sources:[['Steering deck standard','sharepoint','36 files',410,'27 Oct','internal'],['Storytelling with data · course notes','lms','6 modules',88,'14 Oct','internal']],
   chunks:[[0,'One message per slide. The headline is a full sentence; evidence goes in the appendix.'],[0,'A steering deck opens with the decision needed, then the options, then the recommendation.'],[1,'Pick the chart for the comparison you want the reader to make: over time, between items, or part of a whole.']],
   concepts:[['one-message-per-slide','standard','One message per slide','The firm headline rule.','Write the headline as a full sentence. If it needs “and”, it is two slides.',['decision-first'],['slides'],[0]],['decision-first','standard','Decision first','How a steering deck opens.','Open with the decision needed, then the options, then the recommendation.',['one-message-per-slide'],['steering committee'],[0]]] },
 { id:'B2', name:'Belgian tax updates 2026', owner:'Tax & Legal knowledge desk', topic:'tax.cit', topics2:['tax.intl','tax.vat'], desc:'Current legislation, rulings and internal tax alerts. Reviewed every month by the knowledge desk.', access:'tl', fresh:'6', status:'reindex', updated:'30 Oct 2026', usedBy:9,
   tags:['Pillar Two','VAT','investment deduction','2026'], sugg:[['QDMTT',79],['net VAT payer',71]], models: mkModels(['legal','quick']),
   sources:[['Pillar Two guidance and FAQ','web','64 pages',96,'30 Oct','public'],['Programme law 2026 summary','upload','820 KB',44,'12 Oct','internal'],['Internal tax alerts','confluence','212 pages',388,'30 Oct','internal'],['Belgian VAT code','web','1,140 pages',1620,'2 Oct','public']],
   chunks:[[0,'Pillar Two applies to groups with consolidated revenue of €750m or more in at least two of the last four years. The minimum effective rate is 15%.'],[0,'Belgium applies a qualified domestic minimum top-up tax, so the top-up is collected locally before any other jurisdiction can claim it.'],[3,'A company is a net VAT payer when output VAT in grids 54 to 63 exceeds deductible input VAT in grid 59.'],[2,'Tax alert 2026/14: the investment deduction rate for digital investments rises to 20% for assets acquired from 1 January 2026.']],
   concepts:[['pillar-two-scope','rule','Pillar Two scope','Which groups are in scope.','Groups with consolidated revenue of €750m or more in at least two of the last four years. Minimum effective rate 15%.',['belgian-qdmtt'],['Pillar Two'],[0]],['belgian-qdmtt','rule','Belgian QDMTT','How Belgium collects the top-up first.','Belgium applies a qualified domestic minimum top-up tax so the top-up is collected locally before any other jurisdiction.',['pillar-two-scope'],['Pillar Two','QDMTT'],[0]],['net-vat-payer','glossary-term','Net VAT payer','Reading the VAT return.','Output VAT in grids 54 to 63 exceeds deductible input VAT in grid 59.',[],['VAT'],[3]]] },
 { id:'B3', name:'Energy transition sector pack', owner:'Energy sector lead', topic:'ind.energy', topics2:['cons.cost'], desc:'Sector outlook, regulation and podcast transcripts for energy and utilities work.', access:'all', fresh:'6', status:'stale', updated:'3 Mar 2026', usedBy:5,
   tags:['grid tariffs','hedging','procurement','capacity tariff'], sugg:[['load flattening',77]], models: mkModels(['broad']),
   sources:[['Grid tariff methodology 2025','web','48 pages',72,'3 Mar','public'],['Sector outlook 2026','upload','3.4 MB',190,'3 Mar','internal'],['Podcast transcripts · energy series','lms','3 episodes',64,'21 Oct','internal']],
   chunks:[[0,'Distribution tariffs in Flanders move to a capacity component based on the monthly peak, which rewards customers who flatten their load.'],[1,'Utilities hedge 60 to 80% of next year’s volume through forwards; treasury owns the policy, procurement owns execution.'],[2,'Procurement directors reopen scope when the price is fixed but deliverables are loosely defined. Trade timing for scope, never price for scope.']],
   concepts:[['capacity-tariff','concept','Capacity tariff','How the Flemish grid tariff works.','Distribution tariffs include a capacity component based on the monthly peak, which rewards flatter load.',['capacity-tariff-2027'],['capacity tariff'],[0]],['utility-hedging','concept','Utility hedging','Who hedges what, and how much.','Utilities hedge 60 to 80% of next year’s volume through forwards; treasury owns the policy, procurement owns execution.',['capacity-tariff'],['hedging'],[1]],['scope-for-timing','practice','Trade timing for scope','Holding scope with procurement.','When procurement reopens scope, trade timing for scope, never price for scope.',[],['procurement'],[2]]] },
 { id:'B7', name:'Generative AI at the firm', owner:'Technology & risk office', topic:'tec.ai', topics2:['tax.legal'], desc:'The AI use policy and prompting guidance every creator and consultant follows.', access:'all', fresh:'6', status:'indexed', updated:'22 Oct 2026', usedBy:11,
   tags:['prompting','AI policy','client data'], sugg:[['model risk',68]], models: mkModels(['precise','quick']),
   sources:[['Firm AI use policy v3','upload','420 KB',36,'22 Oct','internal'],['Prompting for consultants · course','lms','4 modules',52,'22 Oct','internal'],['Client engagement letters','sharepoint','2,310 files',0,'22 Oct','client']],
   chunks:[[0,'Never paste client-identifying data into a public AI tool. Use the firm workspace, which keeps data inside the EU tenant.'],[1,'Give the model a role, the source material and the format you want back; ask it to cite the passage it used.'],[0,'Every AI-assisted deliverable is reviewed by a person who signs off on the content, not the tool.']],
   concepts:[['client-data-rule','policy','Client data in AI tools','What may and may not be shared.','Never paste client-identifying data into a public AI tool; use the firm workspace.',['human-sign-off'],['client data'],[0]],['human-sign-off','policy','Human sign-off','Who is accountable for AI output.','A named person reviews and signs off every AI-assisted deliverable.',['client-data-rule'],['AI policy'],[0]]] },
 { id:'B4', name:'Communication & feedback', owner:'Talent team', topic:'ppl.fb', topics2:['ppl.pers'], desc:'Feedback models, facilitation guides and the avatar studio scenario library.', access:'all', fresh:'24', status:'indexed', updated:'19 Oct 2026', usedBy:21,
   tags:['feedback','SBI','avatar practice'], sugg:[['difficult conversations',83]], models: mkModels(['precise']),
   sources:[['Feedback model: situation, behaviour, impact','upload','610 KB',22,'19 Oct','internal'],['Avatar studio scenario library','lms','18 scenarios',144,'19 Oct','internal'],['Four Colours facilitator guide','upload','2.8 MB',0,'19 Oct','licensed']],
   chunks:[[0,'Describe the situation, the behaviour you saw and its impact. Ask before you suggest; agree one next step and a date.'],[1,'Hard-feedback scenarios score directness, empathy and a concrete next step on a five-point scale.'],[0,'Keep feedback within a week of the event; later feedback reads as a verdict instead of help.']],
   concepts:[['sbi-feedback','model','Situation, behaviour, impact','The firm feedback model.','Describe the situation, the behaviour and its impact; ask before suggesting; agree one next step and a date.',['feedback-timing'],['feedback','SBI'],[0]],['feedback-timing','practice','Feedback within a week','Why timing matters.','Feedback given more than a week later reads as a verdict instead of help.',['sbi-feedback'],['feedback'],[0]]] },
 { id:'B8', name:'Facilitation toolkit', owner:'Talent team', topic:'ppl.fac', topics2:['cons.prog'], desc:'Agendas, decision logs and techniques for running workshops in the room and online.', access:'all', fresh:'12', status:'indexed', updated:'9 Oct 2026', usedBy:7,
   tags:['workshops','decision log','remote'], sugg:[['introverts',64]], models: mkModels(['quick']),
   sources:[['Workshop agenda templates','sharepoint','14 files',46,'9 Oct','internal'],['Facilitating executive workshops · course','lms','5 modules',61,'9 Oct','internal']],
   chunks:[[0,'A 90-minute design workshop: 10 minutes frame, 50 minutes options, 20 minutes decide, 10 minutes next steps.'],[1,'Keep a visible decision log: decision, owner, date. Read it back before the session closes.'],[1,'For introverted groups, ask for written input first and discuss after.']],
   concepts:[['ninety-minute-agenda','template','90-minute workshop agenda','Timings that work.','Frame, options, decide, next steps: 10, 50, 20 and 10 minutes.',['decision-log'],['workshops'],[0]],['decision-log','practice','Decision log','Recording what was decided.','Decision, owner and date, read back before the session closes.',['ninety-minute-agenda'],['decision log'],[1]]] }
];
export const KB_ACCESS: [string, string][] = [['all','All creators'],['tl','Tax & Legal creators'],['admins','Admins only']];
export const slugify = (s: string) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
export const isoDate = (d: string) => { const M: Record<string, string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }; const p = String(d).split(' '); return (p[2] || '2026') + '-' + (M[p[1]] || '10') + '-' + String(p[0]).padStart(2, '0'); };
export const yamlList = (a: string[]) => '[' + a.map((x) => (/[:,#[\]]/.test(x) ? JSON.stringify(x) : x)).join(', ') + ']';
export const yq = (s: string) => (/[:#"']/.test(s) ? JSON.stringify(s) : s);
