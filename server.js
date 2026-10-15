const http=require('http');const fs=require('fs');const path=require('path');const url=require('url');
const ROOT=__dirname, DATA=path.join(ROOT,'data.json');
const defaults=[
{id:1,name:'Real Madrid Uy Formasi',cat:'Forma',price:899000,img:'./real.png',sizes:['XS','S','M','L','XL','XXL'],custom:true},
{id:2,name:'Real Madrid Mehmon Formasi',cat:'Forma',price:899000,img:'./logo.png',sizes:['XS','S','M','L','XL','XXL'],custom:true},
{id:3,name:'Professional Futbol Butsasi',cat:'Butsa',price:749000,img:'./butsa.png',sizes:['39','40','41','42','43','44','45','46'],custom:false},
{id:4,name:'Match Futbol To‘pi',cat:'To‘p',price:299000,img:'./top.png',sizes:['5-razmer'],custom:false},
{id:5,name:'Chempionlar Kubogi',cat:'Kubok',price:499000,img:'./kubog.png',sizes:['Standart'],custom:false},
{id:6,name:'Futbol Forma Premium',cat:'Forma',price:799000,img:'./ota.png',sizes:['S','M','L','XL'],custom:true}];
function load(){if(!fs.existsSync(DATA))fs.writeFileSync(DATA,JSON.stringify({products:defaults,orders:[]},null,2));return JSON.parse(fs.readFileSync(DATA,'utf8'))}
function save(d){fs.writeFileSync(DATA,JSON.stringify(d,null,2))}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})})}
const server=http.createServer(async(req,res)=>{const u=url.parse(req.url,true),p=u.pathname;if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});return res.end()}
if(p.startsWith('/api/')){let d=load();try{
if(req.method==='GET'&&p==='/api/products')return send(res,200,d.products);
if(req.method==='POST'&&p==='/api/products'){const x=await body(req);x.id=x.id||Date.now();d.products.push(x);save(d);return send(res,201,x)}
if(req.method==='GET'&&p==='/api/orders')return send(res,200,d.orders);
if(req.method==='POST'&&p==='/api/orders'){const x=await body(req),list=Array.isArray(x)?x:Array.isArray(x.orders)?x.orders:[x];for(const o of list)if(!d.orders.some(y=>y.id===o.id))d.orders.push(o);save(d);return send(res,201,list)}
const m=p.match(/^\/api\/(orders|products)\/(.+)$/);if(m){const type=m[1],id=decodeURIComponent(m[2]),arr=d[type];if(req.method==='PUT'){const x=await body(req),i=arr.findIndex(a=>String(a.id)===id);if(i<0)return send(res,404,{error:'not found'});arr[i]={...arr[i],...x};save(d);return send(res,200,arr[i])}if(req.method==='DELETE'){d[type]=arr.filter(a=>String(a.id)!==id);save(d);return send(res,200,{ok:true})}}
return send(res,404,{error:'not found'})}catch(e){return send(res,500,{error:e.message})}}
let file=p==='/'?'/index.html':p;if(file.includes('..'))return send(res,403,{error:'forbidden'});let fp=path.join(ROOT,file);fs.readFile(fp,(e,b)=>{if(e){res.writeHead(404);return res.end('Not found')}const ext=path.extname(fp),types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.avif':'image/avif','.glb':'model/gltf-binary'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(b)})});
server.listen(3000,'0.0.0.0',()=>console.log('Futbol Market: http://localhost:3000'));
