// Seed data for the MyProfessionalMe prototype (verbatim from the Claude Design file).
import type { Learn, Mapping, Project, Test, CloudKey, CloudMeta, AvatarSpec, Signal, Persona } from './types';

export const DOMAINS: [string, string, string][] = [
  ['tech','Job technical skills','Tech skills'],['acad','Academic background','Academic'],['pers','Personal growth','Personal'],
  ['prof','Professional skills','Prof. skills'],['ind','Industry & market','Industry'],['reg','Regulations','Regulation'],
  ['corp','Corporate functions','Corp. fn.'],['tec','Technology','Technol.'],['lead','Leadership','Leading']];
export const LEVELS = ['Foundation','Practitioner','Advanced','Expert','Thought leader'];
export const STAGES = ['Analyst','Consultant','Senior consultant','Manager','Senior manager'];
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
 ['L17','GDPR for consultants','reg',2,'E-learning','Internal academy',1.5,1,'30 Nov 2026','Mandatory for everyone who handles client data. Renewed every two years; your 2024 certificate expires on 30 Nov 2026.'],
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
export const STAGE_FR = [.19,.25,.28,.17,.11];
export const STG_SHORT = ['Analyst','Consultant','Senior','Manager','Sr manager'];
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
// key, first name, full name, stage, audience per lens (bl null = the current business line)
export const PERSONAS: Persona[] = [['jonas','Jonas','Jonas Peeters','Consultant',{ bl:'Consulting', ind:'ind:whole', tec:'tec:sap', amb:'amb:people', pro:'pro:green' }],
 ['amira','Amira','Amira Haddad','Analyst',{ bl:'Tax & Legal', ind:'ind:public', tec:'tec:ai', amb:'amb:expert', pro:'pro:red' }]];
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
