import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {config} from './config.ts';
import {stringify,type Profile} from '../../../packages/shared/model.ts';
export function openStore(path=config.db){
 const db=new DatabaseSync(path); db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO migrations VALUES(1);
 CREATE TABLE IF NOT EXISTS challenges(nonce TEXT PRIMARY KEY,address TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS users(address TEXT PRIMARY KEY,joined INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS site_sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth(token TEXT PRIMARY KEY,address TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,address TEXT NOT NULL,account_id TEXT NOT NULL,profile TEXT NOT NULL,version TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,last_cycle INTEGER NOT NULL DEFAULT 0);
 CREATE UNIQUE INDEX IF NOT EXISTS active_wallet ON sessions(address) WHERE status='active';
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,address TEXT NOT NULL,at INTEGER NOT NULL,kind TEXT NOT NULL,message TEXT NOT NULL,hash TEXT);
 CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL,at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS leases(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS transactions(hash TEXT PRIMARY KEY,address TEXT NOT NULL,session_id TEXT NOT NULL,nonce INTEGER NOT NULL,raw TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,error TEXT);
 CREATE TABLE IF NOT EXISTS delegations(id TEXT PRIMARY KEY,address TEXT NOT NULL,mera TEXT NOT NULL,authorization TEXT NOT NULL,status TEXT NOT NULL,hash TEXT,error TEXT,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS owner_jobs(id TEXT PRIMARY KEY,address TEXT NOT NULL,request TEXT NOT NULL,status TEXT NOT NULL,hash TEXT,error TEXT,result TEXT,created INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS pending_owner_job ON owner_jobs(address) WHERE status IN ('queued','pending');
 CREATE UNIQUE INDEX IF NOT EXISTS pending_delegation ON delegations(address) WHERE status IN ('queued','pending');
 `);
 if(!(db.prepare('PRAGMA table_info(sessions)').all() as any[]).some(c=>c.name==='executor'))db.exec("ALTER TABLE sessions ADD COLUMN executor TEXT NOT NULL DEFAULT ''");
 return db;
}
export type Store=ReturnType<typeof openStore>;
export type Session={id:string,address:string,account_id:string,profile:Profile,version:string,expires:number,status:string,last_cycle:number,executor?:string};
export function atomic<T>(db:Store,fn:()=>T):T{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
export function event(db:Store,address:string,kind:string,message:string,hash?:string){db.prepare('INSERT INTO events(address,at,kind,message,hash) VALUES(?,?,?,?,?)').run(address.toLowerCase(),Date.now(),kind,message,hash||null);}
export function state(db:Store,key:string,value:unknown){db.prepare('INSERT INTO state VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,at=excluded.at').run(key,stringify(value),Date.now());}
export function getState(db:Store,key:string):any{const r=db.prepare('SELECT value,at FROM state WHERE key=?').get(key) as {value:string,at:number}|undefined;return r?{value:JSON.parse(r.value),at:r.at}:null;}
export function lease(db:Store,name:string,owner:string,ttl:number):boolean{return atomic(db,()=>{const r=db.prepare('SELECT owner,expires FROM leases WHERE name=?').get(name) as any;if(r&&r.expires>Date.now()&&r.owner!==owner)return false;db.prepare('INSERT INTO leases VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires').run(name,owner,Date.now()+ttl);return true;});}
export function release(db:Store,name:string,owner:string){db.prepare('DELETE FROM leases WHERE name=? AND owner=?').run(name,owner);}
export function newSession(db:Store,args:Omit<Session,'id'|'status'|'last_cycle'>){return atomic(db,()=>{db.prepare("UPDATE sessions SET status='expired' WHERE status='active' AND expires<=?").run(Date.now());if(Number((db.prepare("SELECT COUNT(*) n FROM sessions WHERE status='active'").get() as any).n)>=25)throw new Error('Workshop is full');const id=randomUUID();db.prepare('INSERT INTO sessions(id,address,account_id,profile,version,expires,status,last_cycle,executor) VALUES(?,?,?,?,?,?,?,0,?)').run(id,args.address,args.account_id,args.profile,args.version,args.expires,'active',args.executor||'');return id;});}
