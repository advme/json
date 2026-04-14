/**
 * GlowyBulletEffect.js — Standalone bullet effect for plain HTML/JS games.
 * 
 * Dependencies (load via CDN before this script):
 *   <script src="https://unpkg.com/three@0.164.1/build/three.min.js"></script>
 *   <script src="https://unpkg.com/three.quarks@0.15.3/dist/three.quarks.umd.js"></script>
 *
 * Usage:
 *   const bullet = new BulletEffect(scene, batchRenderer, {
 *     origin: new THREE.Vector3(0, 0, 0),
 *     target: new THREE.Vector3(10, 0, 0),
 *     speed: 15,
 *     onImpact: function(pos) { console.log("Hit at", pos); },
 *     onComplete: function() { console.log("Done"); }
 *   });
 *   bullet.shoot();
 *   // In your game loop: bullet.update(deltaTime);
 */
(function(global) {
  "use strict";
  
  var Q = global.THREE_QUARKS || global.quarks;
  
  function v4(x,y,z,w) { return new Q.Vector4(x,y,z,w); }
  function v3(x,y,z) { return new Q.Vector3(x,y,z); }

  // --- Texture generators ---
  function generateGlowTexture(inner, outer) {
    var s=64, c=document.createElement("canvas"); c.width=s; c.height=s;
    var ctx=c.getContext("2d"), g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0,inner); g.addColorStop(0.4,inner); g.addColorStop(1,outer+"00");
    ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t;
  }
  function generateDotTexture() {
    var s=32, c=document.createElement("canvas"); c.width=s; c.height=s;
    var ctx=c.getContext("2d"), g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0,"#ffffff"); g.addColorStop(0.3,"#aaddff"); g.addColorStop(1,"#00000000");
    ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t;
  }
  function generateSparkTexture() {
    var s=32, c=document.createElement("canvas"); c.width=s; c.height=s;
    var ctx=c.getContext("2d"), g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0,"#ffffff"); g.addColorStop(0.2,"#ffcc66"); g.addColorStop(0.6,"#ff6600"); g.addColorStop(1,"#00000000");
    ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t;
  }

  function createParticleSystems(scene, batchRenderer) {
    var group = new THREE.Group();
    var bulletGroup = new THREE.Group();
    var impactGroup = new THREE.Group();
    var muzzleFlashGroup = new THREE.Group();
    group.add(bulletGroup); group.add(impactGroup); group.add(muzzleFlashGroup);

    var glowTex = generateGlowTexture("#ffffff","#00ccff");
    var haloTex = generateGlowTexture("#00aaff","#000066");
    var dotTex = generateDotTexture();
    var sparkTex = generateSparkTexture();
    var flashTex = generateGlowTexture("#ffffff","#ffaa44");

    var matOpts = function(tex) {
      return new THREE.MeshBasicMaterial({ map:tex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
    };

    // Bullet core
    var core = new Q.ParticleSystem({
      duration:1, looping:true,
      startLife:new Q.ConstantValue(0.05), startSpeed:new Q.ConstantValue(0),
      startSize:new Q.ConstantValue(0.4), startColor:new Q.ConstantColor(v4(0.7,0.9,1,1)),
      worldSpace:false, emissionOverTime:new Q.ConstantValue(60),
      shape:new Q.PointEmitter(), material:matOpts(glowTex),
      renderMode:Q.RenderMode.BillBoard, renderOrder:2
    });
    core.emitter.name="bulletCore"; bulletGroup.add(core.emitter); batchRenderer.addSystem(core);

    // Outer halo
    var halo = new Q.ParticleSystem({
      duration:1, looping:true,
      startLife:new Q.ConstantValue(0.08), startSpeed:new Q.ConstantValue(0),
      startSize:new Q.ConstantValue(0.7), startColor:new Q.ConstantColor(v4(0.2,0.6,1,0.6)),
      worldSpace:false, emissionOverTime:new Q.ConstantValue(40),
      shape:new Q.PointEmitter(), material:matOpts(haloTex),
      renderMode:Q.RenderMode.BillBoard, renderOrder:1
    });
    halo.emitter.name="bulletHalo"; bulletGroup.add(halo.emitter); batchRenderer.addSystem(halo);

    // Trail
    var trail = new Q.ParticleSystem({
      duration:1, looping:true,
      startLife:new Q.IntervalValue(0.15,0.4), startSpeed:new Q.IntervalValue(0.5,2),
      startSize:new Q.IntervalValue(0.03,0.1), startColor:new Q.ConstantColor(v4(0.5,0.8,1,1)),
      worldSpace:true, emissionOverTime:new Q.ConstantValue(120),
      shape:new Q.SphereEmitter({radius:0.08}), material:matOpts(dotTex),
      renderMode:Q.RenderMode.BillBoard, renderOrder:0
    });
    trail.addBehavior(new Q.SizeOverLife(new Q.PiecewiseBezier([[new Q.Bezier(1,0.8,0.3,0),0]])));
    trail.addBehavior(new Q.ColorOverLife(new Q.Gradient(
      [[v3(0.5,0.85,1),0],[v3(0.2,0.4,1),0.5],[v3(0.1,0.1,0.5),1]],
      [[1,0],[0.6,0.5],[0,1]]
    )));
    trail.emitter.name="bulletTrail"; trail.emitter.rotation.set(0,Math.PI,0);
    bulletGroup.add(trail.emitter); batchRenderer.addSystem(trail);

    // Muzzle flash
    var muzzleFlash = new Q.ParticleSystem({
      duration:0.15, looping:false,
      startLife:new Q.IntervalValue(0.05,0.15), startSpeed:new Q.IntervalValue(2,6),
      startSize:new Q.IntervalValue(0.1,0.4), startColor:new Q.ConstantColor(v4(1,0.8,0.3,1)),
      worldSpace:true, emissionOverTime:new Q.ConstantValue(0),
      emissionBursts:[{time:0,count:new Q.ConstantValue(30),cycle:1,interval:0.01,probability:1}],
      shape:new Q.ConeEmitter({radius:0.05,arc:Math.PI*2,thickness:1,angle:0.3}),
      material:matOpts(flashTex), renderMode:Q.RenderMode.BillBoard, renderOrder:3
    });
    muzzleFlash.addBehavior(new Q.SizeOverLife(new Q.PiecewiseBezier([[new Q.Bezier(1,0.5,0.1,0),0]])));
    muzzleFlash.addBehavior(new Q.ColorOverLife(new Q.Gradient(
      [[v3(1,0.9,0.5),0],[v3(1,0.4,0.1),1]],[[1,0],[0,1]]
    )));
    muzzleFlash.emitter.name="muzzleFlash"; muzzleFlash.emitter.rotation.set(0,0,-Math.PI/2);
    muzzleFlashGroup.add(muzzleFlash.emitter); batchRenderer.addSystem(muzzleFlash);

    // Impact sparks
    var impactSparks = new Q.ParticleSystem({
      duration:0.5, looping:false,
      startLife:new Q.IntervalValue(0.2,0.6), startSpeed:new Q.IntervalValue(3,10),
      startSize:new Q.IntervalValue(0.02,0.08), startColor:new Q.ConstantColor(v4(1,0.7,0.2,1)),
      worldSpace:true, emissionOverTime:new Q.ConstantValue(0),
      emissionBursts:[{time:0,count:new Q.ConstantValue(60),cycle:1,interval:0.01,probability:1}],
      shape:new Q.ConeEmitter({radius:0.05,arc:Math.PI*2,thickness:1,angle:0.8}),
      material:matOpts(sparkTex), renderMode:Q.RenderMode.BillBoard, renderOrder:3
    });
    impactSparks.addBehavior(new Q.SizeOverLife(new Q.PiecewiseBezier([[new Q.Bezier(1,0.8,0.3,0),0]])));
    impactSparks.addBehavior(new Q.ColorOverLife(new Q.Gradient(
      [[v3(1,0.9,0.4),0],[v3(1,0.3,0.05),0.6],[v3(0.3,0.05,0),1]],
      [[1,0],[0.8,0.5],[0,1]]
    )));
    impactSparks.emitter.name="impactSparks"; impactSparks.emitter.rotation.set(0,Math.PI,0);
    impactSparks.pause(); impactGroup.add(impactSparks.emitter); batchRenderer.addSystem(impactSparks);

    // Impact glow
    var impactGlow = new Q.ParticleSystem({
      duration:0.3, looping:false,
      startLife:new Q.IntervalValue(0.1,0.3), startSpeed:new Q.ConstantValue(0),
      startSize:new Q.IntervalValue(0.5,1.2), startColor:new Q.ConstantColor(v4(1,0.6,0.1,0.8)),
      worldSpace:true, emissionOverTime:new Q.ConstantValue(0),
      emissionBursts:[{time:0,count:new Q.ConstantValue(5),cycle:1,interval:0.01,probability:1}],
      shape:new Q.PointEmitter(), material:matOpts(flashTex),
      renderMode:Q.RenderMode.BillBoard, renderOrder:4
    });
    impactGlow.addBehavior(new Q.SizeOverLife(new Q.PiecewiseBezier([[new Q.Bezier(0.5,1,0.8,0),0]])));
    impactGlow.addBehavior(new Q.ColorOverLife(new Q.Gradient(
      [[v3(1,0.8,0.4),0],[v3(0.5,0.1,0),1]],[[1,0],[0,1]]
    )));
    impactGlow.emitter.name="impactGlow"; impactGlow.pause();
    impactGroup.add(impactGlow.emitter); batchRenderer.addSystem(impactGlow);

    scene.add(group);
    return {
      group: group,
      bulletGroup: bulletGroup,
      impactGroup: impactGroup,
      muzzleFlashGroup: muzzleFlashGroup,
      impactSystems: [impactSparks, impactGlow],
      muzzleSystems: [muzzleFlash],
      bulletSystems: [core, halo, trail]
    };
  }

  // ====== BulletEffect Controller ======
  function BulletEffect(scene, batchRenderer, config) {
    config = config || {};
    this._scene = scene;
    this._batchRenderer = batchRenderer;
    this._speed = config.speed || 12;
    this._origin = config.origin || new THREE.Vector3(0,0,0);
    this._target = config.target || new THREE.Vector3(10,0,0);
    this._onImpact = config.onImpact || function(){};
    this._onComplete = config.onComplete || function(){};
    this._autoDispose = config.autoDispose !== false;
    this._phase = "idle";
    this._elapsed = 0;
    this._impactElapsed = 0;
    this._direction = new THREE.Vector3();
    this._totalDistance = 0;
    this._result = null;
    this._disposed = false;
    this._computeDirection();
  }

  BulletEffect.prototype._computeDirection = function() {
    this._direction.copy(this._target).sub(this._origin);
    this._totalDistance = this._direction.length();
    this._direction.normalize();
  };

  BulletEffect.prototype._buildEffect = function() {
    if (this._result) this._scene.remove(this._result.group);
    this._result = createParticleSystems(this._scene, this._batchRenderer);
    var r = this._result;
    r.bulletGroup.position.copy(this._origin);
    r.muzzleFlashGroup.position.copy(this._origin);
    r.impactGroup.position.copy(this._target);
    var q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(1,0,0), this._direction);
    r.muzzleFlashGroup.setRotationFromQuaternion(q);
  };

  BulletEffect.prototype.setOrigin = function(pos) { this._origin.copy(pos); this._computeDirection(); };
  BulletEffect.prototype.setTarget = function(pos) { this._target.copy(pos); this._computeDirection(); };
  BulletEffect.prototype.setSpeed = function(s) { this._speed = s; };
  BulletEffect.prototype.getPhase = function() { return this._phase; };

  BulletEffect.prototype.shoot = function() {
    if (this._disposed) return;
    this._computeDirection();
    this._elapsed = 0;
    this._impactElapsed = 0;
    this._phase = "flying";
    this._buildEffect();
  };

  BulletEffect.prototype.reset = function() {
    this._phase = "idle";
    this._elapsed = 0;
    this._impactElapsed = 0;
    if (this._result) { this._scene.remove(this._result.group); this._result = null; }
  };

  BulletEffect.prototype.update = function(delta) {
    if (this._disposed || !this._result) return;
    if (this._phase === "flying") {
      this._elapsed += delta;
      var dist = this._elapsed * this._speed;
      if (dist >= this._totalDistance) {
        this._phase = "impact";
        this._impactElapsed = 0;
        this._result.bulletGroup.visible = false;
        this._result.impactGroup.position.copy(this._target);
        this._result.impactSystems.forEach(function(s){s.restart();});
        this._result.bulletSystems.forEach(function(s){s.emissionOverTime.value=0;});
        this._onImpact(this._target.clone());
      } else {
        var pos = this._origin.clone().add(this._direction.clone().multiplyScalar(dist));
        this._result.bulletGroup.position.copy(pos);
      }
    } else if (this._phase === "impact") {
      this._impactElapsed += delta;
      if (this._impactElapsed > 1.0) {
        this._phase = "done";
        this._onComplete();
        if (this._autoDispose) this.dispose();
      }
    }
  };

  BulletEffect.prototype.dispose = function() {
    if (this._result) { this._scene.remove(this._result.group); this._result = null; }
    this._disposed = true;
  };

  global.BulletEffect = BulletEffect;
})(window);
