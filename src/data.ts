// Seed data for the MyProfessionalMe prototype (verbatim from the Claude Design file).
import type { Learn, Mapping, Project, Test, Ambition, Interest, CloudKey, CloudMeta, AvatarSpec, Signal, Persona } from './types';

export const DOMAINS: [string, string, string][] = [
  ['tech','Job technical skills','Tech skills'],['acad','Academic background','Academic'],['pers','Personal growth','Personal'],
  ['prof','Professional skills','Prof. skills'],['ind','Industry & market','Industry'],['reg','Regulations','Regulation'],
  ['corp','Corporate functions','Corp. fn.'],['tec','Technology','Technol.'],['lead','Leadership','Leading']];
export const LEVELS = ['Foundation','Practitioner','Advanced','Expert','Thought leader'];
export const STAGES = ['Analyst','Consultant','Senior consultant','Manager','Senior manager'];
export const BLS = ['Consulting','Audit','Tax & Legal'];
export const MY_STAGE = 2;
export const CUR = [3,3,2,3,2,2,1,2,1];
export const TARGET = [4,3,3,4,3,3,2,3,3];
// id,title,dom,lvl,format,source,hours,cpd,state,pct,due,why
export const LEARN: Learn[] = [
 ['L1','Operating model design','tech',3,'E-learning','Internal academy',6,0,'accepted',100,'','Every senior in Consulting designs at least one operating model a year. This is the firm method, with the templates we use in proposals.'],
 ['L2','Value-chain cost modelling in Excel','tech',3,'E-learning','Coursera',8,0,'in-progress',60,'','Advised for seniors who run cost workstreams. Thomas added it after your Delcroix engagement review.'],
 ['L3','Target operating model casebook','tech',4,'Book','Perlego',10,0,'not-started',0,'',''],
 ['L4','Transformation programme design','tech',4,'Classroom','Internal academy',16,0,'not-started',0,'Mar 2027','Mandatory before the Manager promotion review. Two days in Brussels with a live programme case and a partner panel.'],
 ['L5','Corporate finance refresher','acad',3,'E-learning','edX',12,6,'accepted',100,'',''],
 ['L6','Behavioural economics for advisors','acad',3,'Book','Perlego',7,0,'not-started',0,'',''],
 ['L7','Feedback that lands','pers',2,'Game','Internal academy',1.5,0,'accepted',100,'',''],
 ['L8','Resilience & energy management','pers',2,'Mentoring','Coaching',4,0,'in-progress',50,'','Four one-to-one sessions with a firm coach. Advised after the engagement-load survey.'],
 ['L9','Writing for executives','pers',3,'E-learning','Internal academy',3,0,'in-progress',30,'','You chose this one yourself on 3 Sep 2026.'],
 ['L10','Structured problem solving','prof',3,'Classroom','Internal academy',14,8,'accepted',100,'',''],
 ['L11','Client conversations simulator','prof',3,'Game','Internal academy',2,0,'submitted',100,'','Branching conversation game. Thomas reviews your transcript before it counts.'],
 ['L12','Proposal craft: scoping & pricing','prof',4,'E-learning','Internal academy',5,4,'not-started',0,'Jan 2027','Managers own proposals. Mandatory in all three business lines before the promotion review.'],
 ['L13','Belgian retail & wholesale landscape','ind',2,'Website','Internal academy',2,0,'accepted',100,'',''],
 ['L14','Energy transition: market players','ind',3,'E-learning','Coursera',6,0,'not-started',0,'','You chose this one yourself on 14 Oct 2026.'],
 ['L15','Life sciences value chains','ind',3,'Book','O’Reilly',9,0,'not-started',0,'',''],
 ['L16','Independence & ethics annual','reg',1,'E-learning','Internal academy',1,1,'accepted',100,'',''],
 ['L17','GDPR for consultants','reg',2,'E-learning','Internal academy',1.5,1,'in-progress',40,'30 Nov 2026','Mandatory for everyone who handles client data. Renewed every two years; your 2024 certificate expires on 30 Nov 2026.'],
 ['L18','CSRD essentials','reg',3,'Certification','ITAA',10,10,'not-started',0,'','Sustainability reporting now shapes most Manager-level proposals. Counts for 10 ITAA or ACCA units.'],
 ['L19','EU AI Act in practice','reg',3,'E-learning','edX',4,0,'not-started',0,'',''],
 ['L20','How finance closes the books','corp',1,'E-learning','Internal academy',2,0,'accepted',100,'',''],
 ['L21','HR for non-HR: workforce planning','corp',2,'Website','Internal academy',2,0,'not-started',0,'',''],
 ['L22','Procurement fundamentals','corp',2,'Book','Perlego',5,0,'not-started',0,'',''],
 ['L23','Azure fundamentals AZ-900','tec',2,'Certification','Microsoft Learn',12,0,'in-progress',70,'','Advised for Consulting seniors: most transformation programmes now land on Azure, and clients expect you to read an architecture diagram.'],
 ['L24','Generative AI for client work','tec',2,'E-learning','Internal academy',3,0,'accepted',100,'',''],
 ['L25','Data literacy: reading dashboards','tec',1,'Game','Internal academy',1,0,'accepted',100,'',''],
 ['L26','Power BI for consultants','tec',3,'E-learning','Microsoft Learn',9,0,'not-started',0,'','You chose this one yourself on 14 Oct 2026.'],
 ['L27','Leading a workstream','lead',2,'Classroom','Internal academy',12,0,'not-started',0,'Jun 2027','Mandatory before Manager. You lead a simulated workstream for three days with actors as the client team.'],
 ['L28','Coaching conversations','lead',3,'Mentoring','Coaching',6,0,'not-started',0,'',''],
 ['L29','Managing up and across','lead',2,'Book','Perlego',6,0,'not-started',0,'',''],
 ['L30','Inclusive leadership','lead',2,'E-learning','Internal academy',2,0,'accepted',100,'',''],
 ['L31','Reading a Belgian annual account','acad',2,'E-learning','Internal academy',3,2,'accepted',100,'',''],
 ['L32','Negotiating scope with procurement','prof',3,'Classroom','Internal academy',7,4,'not-started',0,'',''],
 ['L33','Facilitating executive workshops','prof',3,'Classroom','Internal academy',8,0,'not-started',0,'',''],
 ['L34','Sustainability strategy for industrials','ind',3,'E-learning','edX',10,6,'not-started',0,'',''],
 ['L35','ESG data and reporting tooling','tec',3,'E-learning','Microsoft Learn',6,0,'not-started',0,'',''],
 ['L36','Delegation and workload planning','lead',2,'E-learning','Internal academy',2,0,'not-started',0,'',''],
 ['L37','Storytelling with data','pers',3,'Game','Internal academy',2,0,'not-started',0,'',''],
 ['L38','Holding scope with a procurement director','prof',3,'Avatar','Avatar studio',1.5,0,'in-progress',40,'','A ten-minute spoken role-play with an AI avatar who reopens agreed scope. Three runs; the best one counts once it reaches 4 of 5 on every skill.'],
 ['L39','Giving hard feedback to a junior','lead',2,'Avatar','Avatar studio',1,0,'not-started',0,'','Practise the conversation before you have it. The avatar is a capable analyst who missed two deadlines and does not see the problem.'],
 ['L40','Presenting a fee increase to a sceptical CFO','prof',4,'Avatar','Avatar studio',1.5,0,'not-started',0,'','The avatar challenges every number. You are scored on clarity, calm and whether you protect the relationship.'],
 ['L41','Calming an escalating client call','pers',3,'Avatar','Avatar studio',1,0,'accepted',100,'','']
];
export const MAPS0: Record<string, Mapping[]> = {
 'Consulting':[['L7','Analyst','mandatory'],['L16','Analyst','mandatory'],['L17','Analyst','mandatory'],['L20','Analyst','advised'],['L31','Analyst','advised'],['L10','Consultant','mandatory'],['L24','Consultant','mandatory'],['L30','Consultant','mandatory'],['L5','Consultant','advised'],['L13','Consultant','advised'],['L1','Senior consultant','mandatory'],['L2','Senior consultant','advised'],['L8','Senior consultant','advised'],['L11','Senior consultant','advised'],['L19','Senior consultant','advised'],['L23','Senior consultant','advised'],['L4','Manager','mandatory'],['L12','Manager','mandatory'],['L27','Manager','mandatory'],['L18','Manager','advised'],['L28','Manager','advised'],['L3','Senior manager','advised']],
 'Audit':[['L7','Analyst','mandatory'],['L16','Analyst','mandatory'],['L17','Analyst','mandatory'],['L31','Analyst','mandatory'],['L20','Analyst','advised'],['L10','Consultant','mandatory'],['L24','Consultant','mandatory'],['L30','Consultant','mandatory'],['L5','Consultant','mandatory'],['L13','Consultant','advised'],['L2','Senior consultant','mandatory'],['L23','Senior consultant','mandatory'],['L1','Senior consultant','advised'],['L8','Senior consultant','advised'],['L11','Senior consultant','advised'],['L19','Senior consultant','advised'],['L12','Manager','mandatory'],['L18','Manager','mandatory'],['L27','Manager','mandatory'],['L4','Manager','advised'],['L28','Manager','advised'],['L6','Senior manager','advised']],
 'Tax & Legal':[['L7','Analyst','mandatory'],['L16','Analyst','mandatory'],['L17','Analyst','mandatory'],['L31','Analyst','mandatory'],['L20','Analyst','advised'],['L24','Consultant','mandatory'],['L30','Consultant','mandatory'],['L5','Consultant','advised'],['L10','Consultant','advised'],['L18','Senior consultant','mandatory'],['L19','Senior consultant','mandatory'],['L2','Senior consultant','advised'],['L8','Senior consultant','advised'],['L15','Senior consultant','advised'],['L26','Senior consultant','advised'],['L12','Manager','mandatory'],['L27','Manager','mandatory'],['L28','Manager','advised'],['L22','Senior manager','advised']]
};
export const TEAM: [string, string, string, number, number, number, number[], string][] = [
 ['JP','Jonas Peeters','Consultant',71,54,0,[3,2,2,3,2,2,1,2,1],'Yesterday'],
 ['AH','Amira Haddad','Analyst',48,31,1,[2,2,1,2,1,1,1,2,1],'3 days ago'],
 ['WC','Wout Claes','Consultant',35,18,2,[2,3,1,2,1,1,0,1,1],'3 weeks ago'],
 ['SL','Sara Lemmens','Analyst',82,66,0,[2,2,2,2,2,1,1,3,1],'Today'],
 ['YD','Yusuf Demir','Consultant',59,47,0,[3,2,2,2,2,2,1,2,2],'Yesterday'],
 ['EV','Elise Van Damme','Analyst',64,40,0,[2,3,2,2,1,2,1,1,1],'5 days ago']
];
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
export const STATE_LABEL: Record<string, string> = { accepted:'Completed', 'in-progress':'In progress', submitted:'Awaiting Thomas', 'not-started':'Not started' };
export const OB_TONE: Record<string, string> = { mandatory:'neutral', advised:'blue', chosen:'green', open:'muted' };
export const OB_LABEL: Record<string, string> = { mandatory:'Mandatory', advised:'Advised', chosen:'Chosen by me', open:'Open' };
export const HEAT = ['#eef0ec','#eef7dc','#c9e39a','#b7d58a','#86BC25','#4c7a10'];
export const PROGRAM_OF: Record<string, string> = { 'Internal academy':'Internal academy', Coursera:'Coursera / edX', edX:'Coursera / edX', ITAA:'Professional bodies', ACCA:'Professional bodies', 'Microsoft Learn':'Microsoft Learn', 'O’Reilly':'Books · O’Reilly, Perlego', Perlego:'Books · O’Reilly, Perlego', Coaching:'Mentoring / coaching' };
export const PROGRAMS: [string, string, string][] = [['Internal academy','synced 07:10 today','#86BC25'],['Coursera / edX','synced yesterday','#86BC25'],['Professional bodies','ACCA · ITAA · IBR/IRE · manual','#a0a69d'],['Microsoft Learn','synced 07:10 today','#86BC25'],['Books · O’Reilly, Perlego','synced 2 days ago','#e0a100'],['Mentoring / coaching','manual','#a0a69d']];
export const PUB: Record<string, [string, string]> = { L19:['clarification','Needs review'], L14:['clarification','Needs review'], L22:['not-started','Draft'] };
export const AV_SWATCHES: [string, string, string][] = [['#1a1d18','#fff','Ink'],['#86BC25','#10180a','Green'],['#2f7fc1','#fff','Blue'],['#8a5a8c','#fff','Plum'],['#4c7a10','#fff','Moss']];
export const AVATARS: Record<string, AvatarSpec> = {
 L38:{ persona:'Marc Verhoeven', role:'Procurement director, energy utility', initials:'MV', brief:'Polite, well prepared and relentless. Reopens scope that was agreed in the last steering committee.', skills:['Assertiveness','Clarity','Listening'], target:4, attempts:[['21 Oct 2026',[2,3,3],'Conceded the second workshop within four minutes.'],['26 Oct 2026',[3,4,4],'Held the line on scope and traded timing instead.']] },
 L39:{ persona:'Noah Claes', role:'Analyst, eight months in', initials:'NC', brief:'Capable and well liked. Missed two deadlines and thinks the plan was unrealistic.', skills:['Directness','Empathy','Next steps'], target:4, attempts:[] },
 L40:{ persona:'Hilde Jacobs', role:'CFO, wholesale trader', initials:'HJ', brief:'Has read the engagement letter twice. Asks for the number behind every number.', skills:['Clarity','Calm','Relationship'], target:4, attempts:[] },
 L41:{ persona:'Pieter Wouters', role:'Operations director, logistics client', initials:'PW', brief:'A go-live slipped and he is under pressure from his own board.', skills:['Calm','Empathy','Ownership'], target:4, attempts:[['2 Jul 2026',[3,4,3],'Apologised well; no clear next step.'],['9 Jul 2026',[4,4,4],'Named the owner and the date before he asked.']] }
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
export const PERSONAS: Persona[] = [['lena','Lena','Lena Mertens','Senior consultant',{ bl:null, ind:'ind:energy', tec:'tec:data', amb:'amb:sust', pro:'pro:blue' }],
 ['jonas','Jonas','Jonas Peeters','Consultant',{ bl:'Consulting', ind:'ind:whole', tec:'tec:sap', amb:'amb:people', pro:'pro:green' }],
 ['amira','Amira','Amira Haddad','Analyst',{ bl:'Tax & Legal', ind:'ind:public', tec:'tec:ai', amb:'amb:expert', pro:'pro:red' }]];
export const PROJECTS: Project[] = [
 { id:'P1', client:'Delcroix Trading BV', name:'Cost-to-serve redesign', role:'Acting workstream lead', period:'Feb – Jun 2026', hours:612, lead:'Thomas De Smet', evaluator:'Thomas De Smet · Senior manager', evalDate:'8 Jul 2026', overall:'Exceeds expectations',
   summary:'Redesigned the cost-to-serve model for 1,400 wholesale customers and the pricing rules that follow from it. Lena took over the analysis workstream in week 6.',
   dims:[['Client impact',2,'The CFO asked for Lena by name for phase two.'],['Problem solving',2,'Found the 11% of customers that carried 40% of logistics cost.'],['Leading others',1,'Took over a team of three in week 6; delegated late and worked the weekends.'],['Communication',1,'Steering decks were precise but too long for the room.'],['Commercial',0,'Not yet involved in scoping or change requests.']],
   quote:'Ready for more ownership. The next step is letting the team do the analysis while she runs the client conversation.',
   advice:[['L36','Plan the workstream before you take it on: delegate the analysis, keep the client conversation.'],['L12','Join the phase-two proposal and write the pricing chapter.'],['L37','One message per steering slide; put the evidence in the appendix.']] },
 { id:'P2', client:'Brabant Energy NV', name:'Post-merger operating model', role:'Senior consultant', period:'Jul – Oct 2026', hours:540, lead:'Inès Dubois', evaluator:'Inès Dubois · Manager', evalDate:'21 Oct 2026', overall:'Meets expectations',
   summary:'Operating model for the merged retail and grid-services business: organisation design, governance and the first 100 days.',
   dims:[['Client impact',1,'Well liked by the HR and operations leads.'],['Problem solving',2,'Picked up the energy-transition context faster than anyone on the team.'],['Leading others',1,'Coached the analyst well.'],['Communication',1,'Let procurement reopen scope three times in workshops.'],['Commercial',1,'Spotted two change requests and handed them over for pricing.']],
   quote:'Strong on content. In the room she needs a stance before the meeting starts, especially with procurement.',
   advice:[['L32','Prepare a negotiation stance before scope discussions with procurement.'],['L38','Rehearse that stance with the procurement avatar before the next workshop.'],['L33','Run the next design workshop yourself, with a written agenda and decision log.'],['L34','Build on the energy context: the sector work comes back in 2027.']] },
 { id:'P3', client:'Flemish Care Group', name:'Procurement diagnostic', role:'Consultant', period:'Sep – Dec 2025', hours:380, lead:'Karel Wouters', evaluator:'Karel Wouters · Director', evalDate:'15 Jan 2026', overall:'Meets expectations',
   summary:'Spend cube and savings plan across 14 hospitals; the plan was signed off at €6.2m over three years.',
   dims:[['Client impact',1,'Savings plan accepted without changes.'],['Problem solving',1,'Solid structure; relied on the data team for every extract.'],['Leading others',1,'Helped onboard the new analyst.'],['Communication',2,'The hospital directors read her notes.'],['Commercial',0,'Not in scope.']],
   quote:'Get closer to the data yourself. Two weeks went on waiting for IT extracts from Azure.',
   advice:[['L23','Learn enough Azure to pull your own extracts.'],['L22','Fill the gap in procurement basics before the next diagnostic.']] },
 { id:'P4', client:'Hoverna Logistics', name:'Cloud migration business case', role:'Senior consultant', period:'Oct 2026 – ongoing', hours:96, lead:'Inès Dubois', evaluator:'Requested from Inès Dubois', evalDate:'', overall:'',
   summary:'Business case for moving warehouse systems to the cloud. The evaluation is due at the end of the engagement.', dims:null, quote:'', advice:[] }
];
export const TESTS: Test[] = [
 { id:'T1', name:'Four Colours', provider:'Firm talent team', date:'Mar 2025', headline:'Cool blue first, earth green second', unit:'%', bars:[['Cool blue',38,'#3a6ea5'],['Earth green',27,'#4f8a3c'],['Sunshine yellow',21,'#c99a12'],['Fiery red',14,'#b8452f']],
   reading:'You lead with precision and want the facts before you act. Under pressure you go quiet rather than push back.', sugg:[['L37','Say the short version first, then the evidence.'],['L28','Red is your least-used energy; coaching practice trains the direct sentence.']] },
 { id:'T2', name:'MBTI', provider:'Certified practitioner', date:'Nov 2024', headline:'INTJ', unit:'%', bars:[['Introversion',64],['Intuition',58],['Thinking',71],['Judging',66]],
   reading:'Clarity of preference per pair. You prepare alone and decide early; long open-ended workshops cost you energy.', sugg:[['L33','A fixed workshop structure makes facilitation cheaper for introverts.']] },
 { id:'T3', name:'Big Five', provider:'Firm talent team', date:'Sep 2026', headline:'High openness and conscientiousness', unit:'th', bars:[['Openness',78],['Conscientiousness',84],['Extraversion',36],['Agreeableness',61],['Emotional stability',55]],
   reading:'Percentile against the firm’s senior consultants. High conscientiousness explains the weekend work on Delcroix as much as the workload does.', sugg:[['L8','Energy management before the Manager year.'],['L14','High openness: broad industry reading pays off for you.']] }
];
export const AMB0: Ambition[] = [
 { id:'A1', text:'Lead sustainability transformations for industrial clients', horizon:'3 years', doms:['ind','reg','tec'], ids:['L34','L18','L35'], from:'Assistant conversation · 14 Oct 2026' },
 { id:'A2', text:'Coach two juniors through their first year', horizon:'1 year', doms:['lead'], ids:['L28','L36'], from:'Counselling conversation · 12 Sep 2026' }
];
export const INT0: Interest[] = [{ label:'Energy transition', dom:'ind', ids:['L14'] }, { label:'Data visualisation', dom:'tec', ids:['L26'] }, { label:'Supply chains', dom:'tech', ids:['L2'] }];
export const CLOUD_META: Record<CloudKey, CloudMeta> = {
 proj:{ label:'Projects', long:'From project evaluations', laneLabel:'Project-led path', laneSub:'advice from 3 evaluations', color:'#2f7fc1', text:'#1d5a8f', wash:'rgba(47,127,193,.14)', anchor:3, frac:.55, screen:'projects', goLabel:'Open projects →' },
 pers:{ label:'Personality', long:'From personality profiles', laneLabel:'Personal style path', laneSub:'from 3 profiles', color:'#8a5a8c', text:'#6e4370', wash:'rgba(138,90,140,.14)', anchor:2, frac:.55, screen:'profile', goLabel:'Open profiles →' },
 amb:{ label:'Ambitions', long:'Toward your ambitions', laneLabel:'Ambition path', laneSub:'your ambitions and interests', color:'#4c7a10', text:'#3f6a0a', wash:'rgba(76,122,16,.14)', anchor:4, frac:.72, screen:'profile', goLabel:'Open ambitions →' }
};
export const KEYWORDS: [string, string, string][] = [['sustain','Sustainability','reg'],['data','Data analysis','tec'],['coach','Coaching others','lead'],['lead','Leading teams','lead'],['health','Healthcare clients','ind'],['abroad','Working abroad','pers'],['financ','Corporate finance','acad'],['writ','Writing','pers'],['negoti','Negotiation','prof'],['sell','Business development','prof'],['supply','Supply chains','tech'],['tax','Tax technology','reg']];
export const IMPORT_RESULTS: [string, string][] = [['Negotiation for consultants','Coursera · 6 h · Professional skills'],['Cloud economics for advisors','Coursera · 4 h · Technology'],['Supply chain analytics','edX · 10 h · Job technical skills']];
