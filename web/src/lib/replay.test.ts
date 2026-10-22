import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { canProject, endTime, fieldBounds, frameAt, projectionAt, recordedFrames } from './replay';
import type { Replay } from './types';
const root=resolve(import.meta.dirname,'../../..');
const data=JSON.parse(readFileSync(resolve(root,'outputs/multigame/replay_data.json'),'utf8'));
const cues=new Set(data.third_down_queue.map((cue:{replay_id:string})=>cue.replay_id));
const replays:Replay[]=data.replays.filter((replay:Replay)=>cues.has(replay.id));
const source=readFileSync(resolve(root,'scripts/report_client.js'),'utf8');
const legacy=vm.createContext({recordedCache:new Map()});
vm.runInContext(source.slice(source.indexOf('function recordedFrames'),source.indexOf('function drawFlight')),legacy);
describe('tracking and projection migration',()=>{
 it('fits every recorded player and both situation lines across all 92 cues',()=>{
   const ratios: number[]=[];
   for(const replay of replays){
     const points=recordedFrames(replay).flatMap(f=>f.players), bounds=fieldBounds(replay,false);
     for(const point of points){expect(point.x).toBeGreaterThan(bounds.x0);expect(point.x).toBeLessThan(bounds.x1);expect(point.y).toBeGreaterThan(bounds.y0);expect(point.y).toBeLessThan(bounds.y1);}
     for(const x of [replay.line_of_scrimmage,replay.situation.line_to_gain]){expect(x).toBeGreaterThan(bounds.x0);expect(x).toBeLessThan(bounds.x1);}
     const projection=projectionAt(replay,endTime(replay));
     const oldPoints=[...points,...(projection?[...projection.sector,projection.projectedReceiver]:[]),{x:replay.line_of_scrimmage,y:0},{x:replay.situation.line_to_gain,y:160/3}];
     const oldX=Math.max(...oldPoints.map(p=>p.x))-Math.min(...oldPoints.map(p=>p.x))+10;
     const oldY=Math.max(...oldPoints.map(p=>p.y))-Math.min(...oldPoints.map(p=>p.y))+8;
     for(const [w,h] of [[750,470],[366,330],[296,330]]){
       const pad=w<500?36:70;
       const before=Math.min((w-pad)/oldX,(h-56)/oldY),after=Math.min((w-pad)/(bounds.x1-bounds.x0),(h-56)/(bounds.y1-bounds.y0));
       expect(after).toBeGreaterThanOrEqual(before-1e-9);ratios.push(after/before);
     }
   }
   ratios.sort((a,b)=>a-b);console.log('Camera scale improvement across 92 cues × 3 sizes:',{minimum:ratios[0],median:ratios[Math.floor(ratios.length/2)],maximum:ratios.at(-1)});
 });

 it('matches the established projection model for all 92 receiver cues',()=>{
   expect(replays).toHaveLength(92);
   for(const replay of replays){
     for(const offset of [.5,1,2]){
       const old=legacy.flightScenario(replay,offset),next=projectionAt(replay,replay.route.observed_seconds+offset);
       expect(Boolean(next),replay.id).toBe(Boolean(old));
       if(next){expect(next.gap).toBeCloseTo(old.gap,9);next.sector.forEach((point,i)=>{expect(point.x).toBeCloseTo(old.sector[i].x,9);expect(point.y).toBeCloseTo(old.sector[i].y,9)});expect(next.projectedReceiver.x).toBeCloseTo(old.projectedReceiver.x,9);expect(next.projectedReceiver.y).toBeCloseTo(old.projectedReceiver.y,9)}
     }
   }
 });
 it('interpolates recorded frames without mutating source positions',()=>{
   const replay=replays[0], original=JSON.stringify(replay);
   const frame=frameAt(replay,.15), old=legacy.animatedFrame(replay,1.5);
   expect(frame.players).toEqual(old.players);expect(frame.separation).toBeCloseTo(old.separation,10);expect(JSON.stringify(replay)).toBe(original);
 });
 it('starts projection continuously at the last measured position',()=>{
   for(const replay of replays.filter(canProject)){
     const last=recordedFrames(replay).at(-1)!;expect(projectionAt(replay,last.t)).toBeNull();
     const future=projectionAt(replay,last.t+.00001)!;
     expect(future.projectedBall.x).toBeCloseTo(future.ball.x,2);
     expect(future.projectedReceiver.y).toBeCloseTo(future.receiver.y,2);
   }
 });
 it('does not extrapolate unavailable data or beyond the horizon',()=>{
   const replay=structuredClone(replays[0]);
   expect(projectionAt(replay,endTime(replay)+.1)).toBeNull();
   replay.post_release.projection_unavailable='Insufficient recorded samples';
   expect(canProject(replay)).toBe(false);expect(projectionAt(replay,99)).toBeNull();
   expect(endTime(replay)).toBe(recordedFrames(replay).at(-1)!.t);
 });
 it('reserves camera bounds for the entire projection in advance',()=>{
   for(const replay of replays){const bounds=fieldBounds(replay,false,true),p=projectionAt(replay,endTime(replay));if(!p)continue;
     for(const point of [...p.sector,p.projectedReceiver]){expect(point.x).toBeGreaterThan(bounds.x0);expect(point.x).toBeLessThan(bounds.x1);expect(point.y).toBeGreaterThan(bounds.y0);expect(point.y).toBeLessThan(bounds.y1)}
   }
 });
});
