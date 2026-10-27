// Every question from the spreadsheet, by ID. 'next' is the routing (the sheet's 'Show when' column).
/* ===================== Questions (IDs match the spreadsheet) ===================== */
const N = {};
function q(id, def){ N[id] = Object.assign({id}, def); }

/* ---------- Start ---------- */
q('A1',{stage:'work', type:'welcome', next:()=> 'A2'});
q('A2',{stage:'work', type:'radio', title:'What work do you want to carry out?',
  options:[
    {v:'new_connection', label:"Install a gas or electricity meter where there isn't one already", hint:'New connection'},
    {v:'meter_move', label:'Move the meter to a different location', hint:'Meter move'},
    {v:'upgrade', label:'Get more power or gas', hint:'Supply upgrade'},
    {v:'downgrade', label:'Reduce the power or gas', hint:'Supply downgrade'}],
  next:c => c.v('A2')==='new_connection' ? 'A3' : 'B2'});
q('A3',{stage:'work', type:'radio', title:'What will the supply be used for?',
  help:'<p>A home with its own separate meter, e.g. a flat above a shop, counts as a home.</p>',
  options:[
    {v:'home', label:'A home (house, flat, farmhouse)', dom:true},
    {v:'home_use', label:'Something at home for personal use (shed, stable, garage, outbuilding, your own EV charger)', dom:true},
    {v:'building_home', label:'Building a new home (temporary building supply)', dom:true},
    {v:'business', label:'A business (shop, office, workshop, studio, yard)'},
    {v:'community', label:'A community space (village hall, clubhouse, pitch)'},
    {v:'care', label:'A care home, holiday park or campsite'},
    {v:'farm', label:'A farm or site equipment (pumps, irrigation, field supply)'},
    {v:'public_ev', label:'Public EV charging or a car park'},
    {v:'other_build', label:"Building something that isn't a home"}],
  next:c => (isDomestic(c.v('A3')) || settings.nonDomestic) ? 'A4' : 'A-END-1'});
function isDomestic(v){ return !!N.A3.options.find(o=>o.v===v)?.dom; }
q('A4',{stage:'work', type:'radio', seg:true, title:'How many properties need a meter installed?',
  options:[{v:'1',label:'1'},{v:'2',label:'2'},{v:'3',label:'3'},{v:'4+',label:'4 or more'}],
  next:c => c.v('A4')==='4+' ? 'A-END-2' : 'B1'});
q('A-END-1',{stage:'work', type:'end', outcome:'not_available'});
q('A-END-2',{stage:'work', type:'end', outcome:'not_available'});

/* ---------- Customer ---------- */
q('B1',{stage:'details', type:'radio', seg:true, title:'Are you already an Octopus Energy customer?', options:YN,
  next:c => c.v('B1')==='yes' ? 'B2' : 'B3'});
q('B2',{stage:'details', type:'login',
  next:c => isNC() ? {id:'C1', p:0} : 'B6'});
q('B3',{stage:'details', type:'radio', title:'Will a person or a business be paying for the energy bills?',
  lead:"This is who the bills will be addressed to – it's separate from what the supply is used for.",
  options:[{v:'person',label:'A person'},{v:'business',label:'A business'}],
  next:c => c.v('B3')==='business' ? 'B4' : 'B5'});
q('B4',{stage:'details', type:'fields', title:'Business details',
  fields:[
    {name:'name', label:'Registered name', type:'text', autocomplete:'organization'},
    {name:'number', label:'Company number', type:'text', sub:'8 characters, for example 01234567 or SC123456', validate:s=>/^[A-Z0-9]{8}$/i.test(s.replace(/\s/g,''))?'':'Enter an 8 character company number'}],
  address:{label:'Billing address', search:true},
  next:()=> 'B5'});
q('B5',{stage:'details', type:'fields', title:'Your details',
  lead: c => c.v('B3')==='business' ? 'The authorised contact for the business. This must be a person, not the business name.' : "Tell us who you are. This must be a person's name, not a business.",
  fields:[
    {name:'first', label:'First name', type:'text', autocomplete:'given-name', validate:personName},
    {name:'last', label:'Last name', type:'text', autocomplete:'family-name', validate:personName},
    {name:'email', label:'Email address', type:'email', autocomplete:'email', validate:s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?'':'Enter a valid email address'},
    {name:'dob', label:'Date of birth', type:'date', sub:"We use this to confirm it's you when you contact us.", validate:s=> s && s < todayISO() ? '' : 'Enter a date of birth in the past'},
    {name:'phone', label:'Phone number', type:'tel', autocomplete:'tel', validate:s=>/^(\+44\s?|0)\d[\d\s]{8,12}$/.test(s.trim())?'':'Enter a UK phone number, like 07700 900123'}],
  next:()=> ({id:'C1', p:0})});
function personName(s){
  if(!s.trim()) return 'This is required';
  if(/\b(ltd|limited|plc|llp|inc|company|co\.)\b/i.test(s)) return "Enter a person's name, not a business";
  return '';
}
q('B6',{stage:'details', type:'accounts', title:'Which property is this for?',
  next:()=> ({meter_move:'D1', upgrade:'E1', downgrade:'F1'})[work()]});
q('B-END-1',{stage:'details', type:'end', outcome:'not_available'});

/* ---------- New connection (repeats per property: p = 0,1,2) ---------- */
q('C1',{stage:'property', type:'radio', seg:true, title:'Which supply does this property need?', options:FUEL_OPTS, next:()=> 'C2'});
q('C2',{stage:'property', type:'postcode', title:"What's the property's postcode?",
  next:c => c.v('C1')==='gas' ? 'C15' : 'C3'});
q('C3',{stage:'property', type:'radio', title:'Do you know the MPAN for the new electricity supply?', lookup:'electricity',
  help:"<p>The MPAN is a 13-digit number that identifies your electricity supply. Your network operator gives it to you, usually on their quote or connection letter.</p><p>If you don't have it, that's fine – we'll look it up for you.</p>"+example('Where to find the MPAN on a connection letter'),
  options:[
    {v:'yes', label:'Yes', input:{placeholder:'13-digit MPAN', inputmode:'numeric', validate:s=>/^\d{13}$/.test(s.replace(/\s/g,''))?'':'The MPAN must be 13 digits'}},
    {v:'unknown', label:"I don't know"}],
  next:c => mpxnOK(c,'C3') ? 'C4' : 'C5'});
q('C4',{stage:'property', type:'confirmAddress', title:'Is this the right address?', from:'C3',
  next:c => c.v('C4')==='no' ? 'C5' : (c.v('C1')==='both' ? 'C15' : 'C6')});
q('C5',{stage:'property', type:'address', title:'Find your address', from:'C3',
  next:c => c.v('C1')==='both' ? 'C15' : 'C6'});
q('C6',{stage:'electricity', type:'radio', fuel:'electricity',
  title:'Has your electricity network operator installed the incoming cable and cut-out (main fuse)?',
  help:'<p>The cut-out is the box holding the main fuse. Your network operator fits it before a meter can go in.</p>'+example('A cut-out with the main fuse'),
  options:[{v:'installed',label:'Yes, it is installed'},{v:'waiting',label:'No, I am waiting for them to install'},{v:'not_contacted',label:"No, I haven't contacted them yet"}],
  next:c => {
    if(c.v('C6')==='installed') return 'C7';
    if(c.v('C6')==='waiting') return 'C8';
    if(c.v('C1')==='both'){ state.flash = "We've noted that your electricity is waiting for your network operator. Let's carry on with gas."; return 'C18'; }
    return 'C-END-1';
  }});
q('C7',{stage:'electricity', type:'upload', fuel:'electricity', title:'Upload a photo of the cut-out', accept:IMG,
  lead:'If it is in a box, open the door. Show the cut-out and the space for the meter.', next:()=> 'C9'});
q('C8',{stage:'electricity', type:'date', fuel:'electricity', title:'When is the network operator installing it?', min:'future', next:()=> 'C9'});
q('C9',{stage:'electricity', type:'radio', fuel:'electricity', title:'What type of electricity meter do you need?', flagOn:['unsure'],
  help:"<p>Your network operator's quote will say. A three phase cut-out has three fuses instead of one. Most homes are single phase.</p>"+example('Single phase vs three phase cut-out'),
  options:[{v:'single',label:'Single phase'},{v:'three',label:'Three phase'},{v:'unsure',label:"I'm not sure"}],
  next:c => c.v('C9')==='unsure' ? 'C14' : 'C10'});
q('C10',{stage:'electricity', type:'radio', fuel:'electricity', title:'What fuse size will your electricity supply have?', flagOn:['unknown'],
  help:"<p>Your network operator can confirm this if you're not sure.</p>", options:FUSE,
  next:c => c.v('C10')==='over100' ? 'C11' : (c.v('C9')==='single' ? 'C13' : 'C14')});
q('C11',{stage:'electricity', type:'radio', fuel:'electricity', title:'Your supply is over 100 amps, so it needs a CT meter. Do you know the CT ratio?', flagOn:['unsure'],
  help:"<p>A CT meter measures your electricity using clamps around the incoming cables. The CT ratio is on your network operator's quote or connection offer, written like 200/5.</p>",
  options:[{v:'yes',label:'Yes',input:{placeholder:'e.g. 200/5',validate:validCT}},{v:'unsure',label:"I'm not sure"}], next:()=> 'C12'});
q('C12',{stage:'electricity', type:'radio', fuel:'electricity', title:'Do you know the kVA rating of the supply?', flagOn:['unsure'],
  help:"<p>kVA is the maximum capacity agreed with your network operator. It's on their quote or connection offer.</p>",
  options:[{v:'yes',label:'Yes',input:{placeholder:'kVA',inputmode:'decimal',suffix:'kVA',validate:validNum(1,5000,'kVA')}},{v:'unsure',label:"I'm not sure"}], next:()=> 'C12a'});
q('C12a',{stage:'electricity', type:'upload', fuel:'electricity', optional:true, accept:DOC,
  title:"Upload your network operator's quote or connection offer (optional)",
  lead:"If you weren't sure of the CT ratio or kVA, our team can read them from this.", next:()=> 'C14'});
q('C13',{stage:'electricity', type:'radio', seg:true, fuel:'electricity', title:'Will you need dedicated off peak output for storage heaters?',
  help:'<p>All our meters can support two rate (Economy 7), but some set ups need a specific 5th terminal that is only on during the off peak. If that is you, select yes here.</p>',
  options:YN, next:()=> 'C14'});
q('C14',{stage:'electricity', type:'date', fuel:'electricity', title:'When do you need the electricity meter installed by?', min:'future',
  help:"<p>This is your deadline, not a booked appointment. We'll confirm a date once we've checked your request.</p>",
  next:c => c.v('C1')==='both' ? 'C18' : 'G2'});
q('C15',{stage:'property', type:'radio', title:'Do you know the MPRN for the new gas supply?', lookup:'gas',
  help:"<p>The MPRN is a 6 to 10 digit number that identifies your gas supply. Your gas network operator gives it to you, usually on their quote.</p><p>If you don't have it, that's fine – we'll look it up for you.</p>",
  options:[
    {v:'yes', label:'Yes', input:{placeholder:'6 to 10 digit MPRN', inputmode:'numeric', validate:s=>/^\d{6,10}$/.test(s.replace(/\s/g,''))?'':'The MPRN must be 6 to 10 digits'}},
    {v:'unknown', label:"I don't know"}],
  next:c => mpxnOK(c,'C15') ? 'C16' : 'C17'});
q('C16',{stage:'property', type:'confirmAddress', title:'Is this the right address?', from:'C15',
  next:c => c.v('C16')==='no' ? 'C17' : (c.v('C1')==='both' ? 'C6' : 'C18')});
q('C17',{stage:'property', type:'address', title:'Find your address', from:'C15', sameAsElec:true,
  next:c => c.v('C1')==='both' ? 'C6' : 'C18'});
q('C18',{stage:'gas', type:'radio', fuel:'gas',
  title:'Has your gas network operator installed the incoming pipework and emergency control valve (ECV)?',
  help:'<p>The emergency control valve (ECV) is the lever that turns your gas on and off, where the pipe comes into the property.</p>'+example('An emergency control valve'),
  options:[{v:'installed',label:'Yes, it is installed'},{v:'waiting',label:'No, I am waiting for them to install'},{v:'not_contacted',label:"No, I haven't contacted them yet"}],
  next:c => {
    if(c.v('C18')==='installed') return 'C19';
    if(c.v('C18')==='waiting') return 'C20';
    const elecGoing = c.v('C1')==='both' && c.v('C6')!=='not_contacted';
    if(elecGoing){ state.flash = "We've noted that your gas is waiting for your network operator. Your electricity request will still go ahead."; return 'G2'; }
    return 'C-END-1';
  }});
q('C19',{stage:'gas', type:'upload', fuel:'gas', title:'Upload a photo of the ECV', accept:IMG, next:()=> 'C21'});
q('C20',{stage:'gas', type:'date', fuel:'gas', title:'When is the network operator installing it?', min:'future', next:()=> 'C21'});
q('C21',{stage:'gas', type:'radio', fuel:'gas', title:'What pressure is the gas supply?', flagOn:['unknown'],
  help:"<p>Most homes are low pressure. Your gas network operator's quote will say.</p>",
  options:[{v:'low',label:'Low pressure'},{v:'medium',label:'Medium pressure'},{v:'unknown',label:"I don't know"}], next:()=> 'C22'});
q('C22',{stage:'gas', type:'radio', seg:true, fuel:'gas', title:'What size gas meter do you need?',
  help:'<p>Most homes need a U6. Larger meters (U16, U25) are for higher gas use.</p>',
  options:[{v:'U6',label:'U6'},{v:'U16',label:'U16'},{v:'U25',label:'U25'},{v:'unknown',label:"I don't know"}],
  next:c => c.v('C22')==='U6' ? 'C25' : 'C23'});
const SPEV_OPTS = [
  {v:'figure',label:'Yes, enter the figure',input:{placeholder:'kWh per hour',inputmode:'numeric',suffix:'kWh/h',validate:validWhole(1,5000,'kWh per hour')}},
  {v:'upload',label:'Yes, upload it',file:DOC},
  {v:'unsure',label:"No / I'm not sure"}];
const SPEV_HELP = '<p>This is sometimes called the Service Pipe Energy Value (SPEV). A Gas Safe engineer or your gas network operator can confirm it.</p><p>Enter it as a rate in kWh per hour, not a yearly total.</p>';
q('C23',{stage:'gas', type:'radio', fuel:'gas', title:'Do you have a document showing the maximum gas demand for your supply?', flagOn:['unsure'],
  help:SPEV_HELP, options:SPEV_OPTS,
  next:c => {
    const a = c.a('C23'), size = c.v('C22');
    if(a.v==='figure' && +a.x >= 64) return 'C24';
    if(a.v!=='figure' && (size==='U16' || size==='U25')) return 'C24';
    return 'C25';
  }});
q('C24',{stage:'gas', type:'radio', fuel:'gas', title:'Do you have a GT1 or service quotation from your gas network operator?', flagOn:['none'],
  help:'<p>Your gas network operator sends this when they quote for the new supply. It confirms the size of the supply.</p>',
  options:[{v:'upload',label:'Yes, upload it',file:DOC},{v:'none',label:"I don't have one"}], next:()=> 'C25'});
q('C25',{stage:'gas', type:'date', fuel:'gas', title:'When do you need the gas meter installed by?', min:'future',
  help:"<p>This is your deadline, not a booked appointment. We'll confirm a date once we've checked your request.</p>", next:()=> 'G2'});
q('C-END-1',{stage:'property', type:'end', outcome:'waiting'});

/* ---------- Meter move ---------- */
q('D1',{stage:'details', type:'radio', seg:true, title:'Which meter are you moving?', options:FUEL_OPTS,
  next:c => c.v('D1')==='gas' ? 'D8' : 'D2'});
q('D2',{stage:'electricity', type:'radio', fuel:'electricity', title:'Where is your electricity meter now?', options:LOCATION,
  help:'<p>Our team will confirm the exact set up from your photos.</p>'+example('A meter in an outside box')+example('A meter on an inside wall'),
  next:c => c.v('D2')==='outside' ? 'D4' : 'D3'});
q('D3',{stage:'electricity', type:'radio', fuel:'electricity', title:'How far is the electricity meter moving?', options:DISTANCE,
  help:"<p>We can move the meter up to 1 metre from the cut-out, on the same wall. Only the meter moves – the cut-out stays where it is.</p>"+example('Diagram: the 1 metre area around the cut-out'),
  next:c => c.v('D3')==='under1' ? 'D6' : 'D4'});
q('D4',{stage:'electricity', type:'radio', fuel:'electricity', title:'This needs your electricity network operator. Have you arranged it with them?', options:DNO_ARRANGED,
  lead:'Moving it this far means the network operator needs to do some work first.',
  next:c => {
    const v = c.v('D4');
    if(v==='date') return 'D5';
    if(v==='contacted') return 'D6';
    if(c.v('D1')==='both'){ state.flash = "We've noted that your electricity is waiting for your network operator. Let's carry on with gas."; return 'D8'; }
    return 'D-END-1';
  }});
q('D5',{stage:'electricity', type:'date', fuel:'electricity', title:'When will the electricity network operator finish their work?', min:'today',
  help:"<p>We'll use this to plan our visit. It isn't a booked appointment – we'll confirm a date with you.</p>", next:()=> 'D6'});
q('D6',{stage:'electricity', type:'upload', fuel:'electricity', title:'Upload a photo of where the electricity meter is now', accept:IMG, next:()=> 'D7'});
q('D7',{stage:'electricity', type:'upload', fuel:'electricity', title:'Upload a photo of where the electricity meter is moving to', accept:IMG, next:()=> 'D7a'});
q('D7a',{stage:'electricity', type:'radio', seg:true, fuel:'electricity', title:'Is the new meter position ready?', options:YNU, flagOn:['no','unsure'],
  help:'<p>The new position needs clear space and easy access for the engineer, and any wiring changes on your side need to be done before we visit.</p>',
  next:c => c.v('D1')==='both' ? 'D8' : 'G1'});
q('D8',{stage:'gas', type:'radio', fuel:'gas', title:'Where is your gas meter now?', options:LOCATION,
  help:'<p>Our team will confirm the exact set up from your photos.</p>'+example('A gas meter in an outside box')+example('A gas meter on an inside wall'),
  next:c => c.v('D8')==='outside' ? 'D10' : 'D9'});
q('D9',{stage:'gas', type:'radio', fuel:'gas', title:'How far is the gas meter moving?', options:DISTANCE,
  help:"<p>We can move the meter up to 1 metre from the emergency control valve (ECV), on the same wall. Only the meter moves – the incoming pipe and ECV stay where they are.</p>"+example('Diagram: the 1 metre area around the ECV'),
  next:c => c.v('D9')==='under1' ? 'D12' : 'D10'});
q('D10',{stage:'gas', type:'radio', fuel:'gas', title:'This needs your gas network operator. Have you arranged it with them?', options:DNO_ARRANGED,
  next:c => {
    const v = c.v('D10');
    if(v==='date') return 'D11';
    if(v==='contacted') return 'D12';
    const elecGoing = c.v('D1')==='both' && c.v('D4')!=='not_yet';
    if(elecGoing){ state.flash = "We've noted that your gas is waiting for your network operator. Your electricity request will still go ahead."; return 'G1'; }
    return 'D-END-1';
  }});
q('D11',{stage:'gas', type:'date', fuel:'gas', title:'When will the gas network operator finish their work?', min:'today',
  help:"<p>We'll use this to plan our visit. It isn't a booked appointment – we'll confirm a date with you.</p>", next:()=> 'D12'});
q('D12',{stage:'gas', type:'upload', fuel:'gas', title:'Upload a photo of where the gas meter is now', accept:IMG, next:()=> 'D13'});
q('D13',{stage:'gas', type:'upload', fuel:'gas', title:'Upload a photo of where the gas meter is moving to', accept:IMG, next:()=> 'D13a'});
q('D13a',{stage:'gas', type:'radio', seg:true, fuel:'gas', title:'Is the new meter position ready?', options:YNU, flagOn:['no','unsure'],
  help:'<p>The new position needs clear space and easy access for the engineer, and any pipework changes on your side need to be done by a Gas Safe engineer before we visit.</p>',
  next:()=> 'G1'});
q('D-END-1',{stage:'details', type:'end', outcome:'waiting'});

/* ---------- Supply upgrade ---------- */
q('E1',{stage:'details', type:'radio', seg:true, title:'Which supply are you upgrading?', options:FUEL_OPTS,
  next:c => c.v('E1')==='gas' ? 'E13' : 'E2'});
q('E2',{stage:'electricity', type:'radio', fuel:'electricity', title:'What are you looking to change about your electricity supply?', flagOn:['network_said','unsure'],
  help:'<p>Most homes have a supply of up to 100 amps. Above that needs a CT meter, which measures your electricity using clamps around the incoming cables.</p>',
  options:[
    {v:'to_three',label:'Change from single phase to three phase'},
    {v:'more_power',label:'Get more power than my current supply allows (over 100 amps)'},
    {v:'network_said',label:'My network operator or electrician said I need a different meter'},
    {v:'unsure',label:"I'm not sure"}],
  next:()=> 'E2a'});
q('E2a',{stage:'electricity', type:'radio', fuel:'electricity', title:'What fuse size will your new supply have?', flagOn:['unknown'],
  help:"<p>Your network operator's quote will say.</p>", options:FUSE,
  next:c => c.v('E2a')==='over100' ? 'E3' : (c.v('E2')==='to_three' ? 'E7' : 'E9')});
q('E3',{stage:'electricity', type:'radio', fuel:'electricity', title:'Do you know the kVA rating of the new supply?', flagOn:['unsure'],
  help:"<p>kVA is the maximum capacity agreed with your network operator. It's on their quote or connection offer.</p>",
  options:[{v:'yes',label:'Yes',input:{placeholder:'kVA',inputmode:'decimal',suffix:'kVA',validate:validNum(1,5000,'kVA')}},{v:'unsure',label:"I'm not sure"}], next:()=> 'E4'});
q('E4',{stage:'electricity', type:'radio', fuel:'electricity', title:'What exact fuse size will the supply have?', flagOn:['unsure'],
  options:[{v:'yes',label:'I know it',input:{placeholder:'Amps',inputmode:'numeric',suffix:'amps',validate:validWhole(101,5000,'amps')}},{v:'unsure',label:"I'm not sure"}], next:()=> 'E5'});
q('E5',{stage:'electricity', type:'radio', fuel:'electricity', title:'Do you know the CT ratio?', flagOn:['unsure'],
  help:"<p>The CT ratio is on your network operator's quote or connection offer, written like 200/5.</p>",
  options:[{v:'yes',label:'Yes',input:{placeholder:'e.g. 200/5',validate:validCT}},{v:'unsure',label:"I'm not sure"}], next:()=> 'E5a'});
q('E5a',{stage:'electricity', type:'upload', fuel:'electricity', optional:true, accept:DOC,
  title:"Upload your network operator's quote or connection offer (optional)",
  lead:"If you weren't sure of the kVA, fuse size or CT ratio, our team can read them from this.", next:()=> 'E6'});
q('E6',{stage:'electricity', type:'tariffs', fuel:'electricity', title:'Which tariff do you want?', next:()=> 'E9'});
q('E7',{stage:'electricity', type:'radio', fuel:'electricity', title:'Is there already a three phase cut-out at the property?',
  help:'<p>A three phase cut-out has three main fuses instead of one.</p>'+example('A three phase cut-out'),
  options:[{v:'yes',label:'Yes'},{v:'no',label:'No'},{v:'unknown',label:"I don't know"}],
  next:c => c.v('E7')==='yes' ? 'E11' : 'E8'});
q('E8',{stage:'electricity', type:'radio', fuel:'electricity', title:'This needs your electricity network operator. Have you arranged it with them?', options:DNO_ARRANGED,
  next:c => {
    const v = c.v('E8');
    if(v==='date') return 'E10';
    if(v==='contacted') return 'E11';
    if(c.v('E1')==='both'){ state.flash = "We've noted that your electricity is waiting for your network operator. Let's carry on with gas."; return 'E13'; }
    return 'E-END-1';
  }});
q('E9',{stage:'electricity', type:'radio', fuel:'electricity', title:'Is your network operator doing any work on your supply for this upgrade?', options:YNU, flagOn:['no','unsure'],
  next:c => c.v('E9')==='yes' ? 'E10' : 'E11'});
q('E10',{stage:'electricity', type:'date', fuel:'electricity', title:'When will the electricity network operator finish their work?', min:'future',
  help:"<p>We'll use this to plan our visit. It isn't a booked appointment – we'll confirm a date with you.</p>", next:()=> 'E11'});
q('E11',{stage:'electricity', type:'upload', fuel:'electricity', title:'Upload a photo of the meter location', accept:IMG, next:()=> 'E12'});
q('E12',{stage:'electricity', type:'upload', fuel:'electricity', title:'Upload a photo of the cut-out', accept:IMG,
  lead:'This lets our team check the cut-out before booking.', next:c => c.v('E1')==='both' ? 'E13' : 'G1'});
q('E13',{stage:'gas', type:'radio', fuel:'gas', title:'What gas upgrade are you making?', flagOn:['unsure'],
  options:[{v:'U6-U16',label:'U6 → U16'},{v:'U6-U25',label:'U6 → U25'},{v:'U16-U25',label:'U16 → U25'},{v:'unsure',label:"Something else / I'm not sure"}], next:()=> 'E14'});
q('E14',{stage:'gas', type:'radio', fuel:'gas', title:'Do you have a document showing the maximum gas demand for your supply?', flagOn:['unsure'],
  help:SPEV_HELP, options:SPEV_OPTS, next:()=> 'E15'});
q('E15',{stage:'gas', type:'radio', seg:true, fuel:'gas', title:'Has the gas network operator finished upgrading the supply?', options:YNU,
  next:c => c.v('E15')==='yes' ? 'E16a' : 'E16'});
q('E16',{stage:'gas', type:'date', fuel:'gas', title:'When will the gas network operator finish their work?', min:'future',
  help:"<p>We'll use this to plan our visit. It isn't a booked appointment – we'll confirm a date with you.</p>", next:()=> 'E16a'});
q('E16a',{stage:'gas', type:'radio', seg:true, fuel:'gas', title:'Is there room for the bigger meter where your meter is now?', options:YNU, flagOn:['no','unsure'],
  help:'<p>U16 and U25 meters are much bigger than a U6. If your meter is in an outside box, the box may need replacing.</p>'+example('Size comparison: U6, U16 and U25'),
  next:()=> 'E17'});
q('E17',{stage:'gas', type:'radio', fuel:'gas', title:'Do you have a GT1 or service quotation?',
  help:'<p>Your gas network operator sends this when they quote for the upgrade. It confirms the size of the supply.</p>',
  options:[{v:'upload',label:'Yes, upload it',file:DOC},{v:'unknown',label:"I don't know"}], next:()=> 'E18'});
q('E18',{stage:'gas', type:'upload', fuel:'gas', title:'Upload a photo of the meter location', accept:IMG, next:()=> 'E19'});
q('E19',{stage:'gas', type:'upload', fuel:'gas', title:'Upload a photo of the ECV', accept:IMG, next:()=> 'G1'});
q('E-END-1',{stage:'details', type:'end', outcome:'waiting'});

/* ---------- Supply downgrade ---------- */
q('F1',{stage:'details', type:'radio', seg:true, title:'Which supply are you downgrading?', options:FUEL_OPTS,
  next:c => c.v('F1')==='gas' ? 'F8' : 'F2'});
q('F2',{stage:'electricity', type:'radio', fuel:'electricity', title:'What electricity downgrade are you making?',
  options:[
    {v:'3wc-1',label:'Three phase whole current → single phase'},
    {v:'ct3-3wc',label:'CT three phase → three phase whole current'},
    {v:'ct3-1wc',label:'CT three phase → single phase whole current'},
    {v:'ct1-1wc',label:'CT single phase → single phase whole current'}],
  next:()=> 'F3'});
q('F3',{stage:'electricity', type:'radio', fuel:'electricity', title:'This needs your electricity network operator. Have you arranged it with them?', options:DNO_ARRANGED,
  lead:'Every downgrade changes the supply, so the network operator always needs to be involved.',
  next:c => {
    const v = c.v('F3');
    if(v==='date') return 'F4';
    if(v==='contacted') return 'F5';
    if(c.v('F1')==='both'){ state.flash = "We've noted that your electricity is waiting for your network operator. Let's carry on with gas."; return 'F8'; }
    return 'F-END-1';
  }});
q('F4',{stage:'electricity', type:'date', fuel:'electricity', title:'When will the electricity network operator finish their work?', min:'future',
  help:"<p>We'll use this to plan our visit. It isn't a booked appointment – we'll confirm a date with you.</p>", next:()=> 'F5'});
q('F5',{stage:'electricity', type:'upload', fuel:'electricity', title:'Upload a clear photo showing the whole electricity meter', accept:IMG, next:()=> 'F6'});
q('F6',{stage:'electricity', type:'upload', fuel:'electricity', title:'Upload a clear photo of the cut-out and service head', accept:IMG, next:()=> 'F7'});
q('F7',{stage:'electricity', type:'tick', fuel:'electricity', title:'Confirm your supply will be reduced',
  text:"Your supply capacity will be reduced. If you need it increased again later, it'll take around 4 to 6 weeks. Please confirm this is what you want.",
  next:c => c.v('F1')==='both' ? 'F8' : 'G1'});
q('F8',{stage:'gas', type:'radio', seg:true, fuel:'gas', title:'What gas downgrade are you making?',
  options:[{v:'U16-U6',label:'U16 → U6'},{v:'U25-U6',label:'U25 → U6'},{v:'U25-U16',label:'U25 → U16'}], next:()=> 'F9'});
q('F9',{stage:'gas', type:'upload', fuel:'gas', title:'Upload a clear photo showing the whole gas meter', accept:IMG, next:()=> 'F10'});
q('F10',{stage:'gas', type:'upload', fuel:'gas', title:'Upload a clear photo of the emergency control valve', accept:IMG, next:()=> 'F11'});
q('F11',{stage:'gas', type:'tick', fuel:'gas', title:'Confirm your gas supply will be reduced',
  text:"Your gas supply capacity will be reduced. If you need it increased again later, it'll take around 4 to 6 weeks. Please confirm this is what you want.",
  next:()=> 'F12'});
q('F12',{stage:'gas', type:'radio', seg:true, fuel:'gas', title:'Is your gas network operator doing any work on the supply, such as moving the incoming supply?', options:YN,
  next:c => c.v('F12')==='yes' ? 'F13' : 'F14'});
q('F13',{stage:'gas', type:'date', fuel:'gas', title:'When is the gas network operator doing the work?', min:'future', next:()=> 'F14'});
q('F14',{stage:'gas', type:'radio', fuel:'gas', title:'Do you have a GT1 or service quotation?',
  options:[{v:'upload',label:'Yes, upload it',file:DOC},{v:'unknown',label:"I don't know"}], next:()=> 'G1'});
q('F-END-1',{stage:'details', type:'end', outcome:'waiting'});

/* ---------- End ---------- */
q('G1',{stage:'visit', type:'date', title:'What date would you like the work done?', min:'future',
  help:"<p>This is your preferred date, not a booked appointment. We'll confirm a date once we've checked your request.</p>", next:()=> 'G2'});
q('G2',{stage:'visit', type:'radio', seg:true, title:'Is anyone living at the property?', options:[{v:'yes',label:'Yes'},{v:'not_yet',label:'Not yet'}],
  next:c => c.v('G2')==='not_yet' ? 'G3' : 'G4'});
q('G3',{stage:'visit', type:'date', title:'When will someone move in?', min:'future', next:()=> 'G4'});
q('G4',{stage:'visit', type:'checks', title:'Does anyone at the property need extra support?',
  lead:'Select all that apply. This helps our engineers plan the visit, and we add it to the Priority Services Register.',
  none:'No, nobody needs extra support',
  options:['Medical equipment reliant on power or water','Children under five','Blind or partially sighted','Deaf or hard of hearing','Chronic illness','Mental health condition','Disability','Pensionable age','Loss of smell','Documents in another format or language','Temporary extra support'].map(l=>({v:l,label:l})),
  next:()=> 'G5'});
q('G5',{stage:'visit', type:'radio', title:'Who should the engineer contact on site?',
  options:[{v:'me',label:'Me (account holder)'},{v:'site',label:'Someone else on site'}],
  next:c => c.v('G5')==='site' ? 'G6' : afterVisit(c)});
q('G6',{stage:'visit', type:'fields', title:'Site contact details',
  fields:[{name:'name',label:'Name',type:'text',validate:personName},
          {name:'phone',label:'Phone number',type:'tel',validate:s=>/^(\+44\s?|0)\d[\d\s]{8,12}$/.test(s.trim())?'':'Enter a UK phone number, like 07700 900123'}],
  next:c => afterVisit(c)});
function afterVisit(c){ return isNC() ? (c.p < 2 ? 'G7' : {id:'G8', p:null}) : 'G8'; }
q('G7',{stage:'review', type:'radio', seg:true, title:'Do you need a new connection at another property?', options:YN,
  lead: c => `You've added ${c.p+1} ${c.p? 'properties':'property'}. You can add up to 3 in one request.`,
  next:c => c.v('G7')==='yes' ? {id:'C1', p:c.p+1} : {id:'G8', p:null}});
q('G8',{stage:'review', type:'textarea', title:'Anything else we should know?', optional:true,
  lead:'For example, access arrangements, parking, or a dog on site.', next:()=> 'G9'});
q('G9',{stage:'review', type:'summary', title:'Check your answers', next:()=> 'G10'});
q('G10',{stage:'review', type:'terms', title:'Terms', next:c => c.v('G10')==='agree' ? 'G-END-1' : 'G-END-2'});
q('G-END-1',{stage:'review', type:'end', outcome:'submitted'});
q('G-END-2',{stage:'review', type:'end', outcome:'declined'});
