/* Sparse alpha deltas: one reversible entry per brush stroke, per photo. */
(function(root) {
  class History {
    constructor(limit = 16*1024*1024) { this.limit=limit; this.past=[]; this.future=[]; this.bytes=0; }
    record(before, after) {
      if(before.length!==after.length) throw new Error('Mask dimensions changed');
      let count=0; for(let i=0;i<before.length;i++) if(before[i]!==after[i]) count++;
      if(!count) return;
      const patch={indices:new Uint32Array(count),before:new Uint8Array(count),after:new Uint8Array(count)};
      for(let i=0,j=0;i<before.length;i++) if(before[i]!==after[i]) {patch.indices[j]=i;patch.before[j]=before[i];patch.after[j++]=after[i];}
      for(const p of this.future) this.bytes-=p.indices.length*6;
      this.future=[];this.past.push(patch);this.bytes+=count*6;
      // Eviction drops reversibility of oldest strokes, never their visible paint.
      while(this.bytes>this.limit && this.past.length>1) this.bytes-=this.past.shift().indices.length*6;
    }
    apply(state, redo=false) {
      const from=redo?this.future:this.past, to=redo?this.past:this.future, patch=from.pop();
      if(!patch) return false;
      const values=redo?patch.after:patch.before;
      patch.indices.forEach((index,i)=>{state[index]=values[i];});to.push(patch);return true;
    }
  }
  function turnDelta(previous,current) { return Math.atan2(Math.sin(current-previous),Math.cos(current-previous))*180/Math.PI; }
  const api={History,turnDelta};
  if(typeof module!=='undefined') module.exports=api; else root.EditorActions=api;
})(typeof window!=='undefined'?window:globalThis);
