(function () {
  "use strict";

  var doc = document;
  var win = window;
  var THREE = win.THREE;
  var app = doc.getElementById("app");
  var container = doc.getElementById("canvas-container");
  var unsupported = doc.getElementById("unsupported");

  // --- AUDIO SYNTH (Tambahan Suara Trash, Win, dan Fail) ---
  var audioCtx = null;
  function playSynth(type) {
    if (!win.AudioContext && !win.webkitAudioContext) return;
    if (!audioCtx) audioCtx = new (win.AudioContext || win.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    var now = audioCtx.currentTime;
    
    if (type === 'lift' || type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'drop') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'trash') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'win') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      osc.frequency.setValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'fail') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.5);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  }

  function supportsWebGL() {
    try {
      var canvas = doc.createElement("canvas");
      return !!(win.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch (error) {
      return false;
    }
  }

  if (!THREE || !supportsWebGL()) {
    app.hidden = true;
    unsupported.hidden = false;
    return;
  }

  var objects = [];
  var blueprintObjects = [];
  var selectedObject = null;
  var draggedObject = null;
  var isCreatorMode = false;
  var dragMoved = false;
  var gameTimer = null;
  var timeLeft = 0;
  var totalTime = 0;
  var isGameActive = false;
  var blueprintComplete = false;
  var toastTimeout = null;
  var cameraStream = null;
  var handCamera = null;
  var handFrameId = null;
  var handProcessing = false;
  var handTrackingReady = false;
  var handStartupTimeout = null;
  var handsController = null;
  var lastTouchDistance = 0;
  var orbiting = false;
  var orbitStart = { x: 0, y: 0 };
  var orbitOrigin = { theta: 0, phi: 0 };
  var activePointerId = null;
  
  // Ukuran global semua bricks saat ini
  var currentGlobalScale = 1;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1b17);
  scene.fog = new THREE.Fog(0x1b1b17, 18, 34);

  var cameraRadius = 15;
  var cameraTheta = 0.62;
  var cameraPhi = 0.58;
  var camera = new THREE.PerspectiveCamera(54, win.innerWidth / win.innerHeight, 0.1, 100);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default" });
  } catch (error) {
    app.hidden = true;
    unsupported.hidden = false;
    return;
  }
  renderer.setSize(win.innerWidth, win.innerHeight);
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();
  var dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  var scratchPoint = new THREE.Vector3();
  var trashPosition = new THREE.Vector3(-5, 0, -5);
  var baseColors = [0xd94a35, 0xe4b83e, 0x326f8b, 0x55765a, 0xdfd7c6, 0x9b5f49];

  function updateCameraPosition() {
    camera.position.x = cameraRadius * Math.sin(cameraTheta) * Math.cos(cameraPhi);
    camera.position.y = cameraRadius * Math.sin(cameraPhi);
    camera.position.z = cameraRadius * Math.cos(cameraTheta) * Math.cos(cameraPhi);
    camera.lookAt(0, 1.2, 0);
  }
  updateCameraPosition();

  scene.add(new THREE.HemisphereLight(0xfff2d2, 0x252a2a, 1.25));
  var keyLight = new THREE.DirectionalLight(0xffefd1, 1.05);
  keyLight.position.set(7, 13, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  scene.add(keyLight);
  var fillLight = new THREE.DirectionalLight(0x6688a0, 0.34);
  fillLight.position.set(-8, 5, -8);
  scene.add(fillLight);

  var floorMaterial = new THREE.MeshStandardMaterial({ color: 0x24241f, roughness: 0.92, metalness: 0.02 });
  var floor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.35, 24), floorMaterial);
  floor.position.y = -0.22;
  floor.receiveShadow = true;
  floor.userData.isFloor = true;
  scene.add(floor);

  var grid = new THREE.GridHelper(24, 24, 0x6a6a5f, 0x34342e);
  grid.position.y = 0.01;
  scene.add(grid);

  var trash = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 1.8),
    new THREE.MeshBasicMaterial({ color: 0xd94a35, transparent: true, opacity: 0.72 })
  );
  trash.position.set(trashPosition.x, 0.05, trashPosition.z);
  scene.add(trash);
  var trashOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8, 0.16, 1.8)),
    new THREE.LineBasicMaterial({ color: 0xffb09f })
  );
  trashOutline.position.set(trashPosition.x, 0.09, trashPosition.z);
  scene.add(trashOutline);

  function materialFor(color) {
    return new THREE.MeshStandardMaterial({ color: color, roughness: 0.42, metalness: 0.03 });
  }

  function makeLego(type, color) {
    var group = new THREE.Group();
    var material = materialFor(color);
    var body;
    var studGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 18);

    if (type === "sphere") {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), material);
      group.add(body);
    } else if (type === "pyramid") {
      body = new THREE.Mesh(new THREE.ConeGeometry(0.705, 1, 4), material);
      group.add(body);
      group.rotation.y = Math.PI / 4;
    } else {
      var width = type === "longblock" ? 3 : (type === "block" ? 2 : 1);
      body = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.92, 0.96), material);
      group.add(body);
      var studCount = type === "longblock" ? 3 : (type === "block" ? 2 : 1);
      for (var index = 0; index < studCount; index += 1) {
        var stud = new THREE.Mesh(studGeometry, material);
        var offsetX = studCount === 1 ? 0 : (studCount === 2 ? index - 0.5 : index - 1);
        stud.position.set(offsetX, 0.54, 0);
        group.add(stud);
      }
    }

    group.traverse(function (child) {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.userData.type = type;
    group.userData.color = color;
    return group;
  }

  function randomColor() {
    return baseColors[Math.floor(Math.random() * baseColors.length)];
  }

  function objectMeshes(exceptObject) {
    var meshes = [];
    objects.forEach(function (object) {
      if (object === exceptObject) return;
      object.traverse(function (child) {
        if (child.isMesh) meshes.push(child);
      });
    });
    return meshes;
  }
  
  function rootObject(mesh) {
    var target = mesh;
    while (target.parent && target.parent !== scene) target = target.parent;
    return target;
  }

  function heightAt(x, z, exceptObject) {
    var downRay = new THREE.Raycaster(new THREE.Vector3(x, 25, z), new THREE.Vector3(0, -1, 0));
    var hits = downRay.intersectObjects(objectMeshes(exceptObject), false);
    if (!hits.length) return 0;
    return rootObject(hits[0].object).position.y + 0.5;
  }

  function bpHeightAt(x, z, exceptObject) {
    var highest = 0;
    blueprintObjects.forEach(function (bp) {
      if (bp === exceptObject) return;
      if (Math.abs(bp.position.x - x) < 0.6 && Math.abs(bp.position.z - z) < 0.6) {
        highest = Math.max(highest, bp.position.y);
      }
    });
    return highest;
  }

  // Parameter ignoreY ditambahkan untuk memastikan posisi klik/rotasi tidak terbang ke atas tumpukan
  function snappedPlacement(object, ignoreY) {
    var snapX = Math.round(object.position.x);
    var snapZ = Math.round(object.position.z);
    var type = object.userData.type || object.userData.requiredType;
    var isBlueprint = !!object.userData.requiredType;
    
    if (type === "block") {
      var normalizedRotation = Math.abs(object.rotation.y) % Math.PI;
      var zAligned = Math.abs(normalizedRotation - Math.PI / 2) < 0.4;
      if (zAligned) {
        snapZ = Math.floor(object.position.z) + 0.5;
        if (!ignoreY) {
          if (isBlueprint) object.position.y = Math.max(bpHeightAt(snapX, snapZ - 0.5, object), bpHeightAt(snapX, snapZ + 0.5, object)) + 0.5;
          else object.position.y = Math.max(heightAt(snapX, snapZ - 0.5, object), heightAt(snapX, snapZ + 0.5, object)) + 0.5;
        }
      } else {
        snapX = Math.floor(object.position.x) + 0.5;
        if (!ignoreY) {
          if (isBlueprint) object.position.y = Math.max(bpHeightAt(snapX - 0.5, snapZ, object), bpHeightAt(snapX + 0.5, snapZ, object)) + 0.5;
          else object.position.y = Math.max(heightAt(snapX - 0.5, snapZ, object), heightAt(snapX + 0.5, snapZ, object)) + 0.5;
        }
      }
    } else if (type === "longblock") {
      var normRot = Math.abs(object.rotation.y) % Math.PI;
      var zAlign = Math.abs(normRot - Math.PI / 2) < 0.4;
      if (zAlign) {
        if (!ignoreY) {
          if (isBlueprint) object.position.y = Math.max(bpHeightAt(snapX, snapZ - 1, object), bpHeightAt(snapX, snapZ, object), bpHeightAt(snapX, snapZ + 1, object)) + 0.5;
          else object.position.y = Math.max(heightAt(snapX, snapZ - 1, object), heightAt(snapX, snapZ, object), heightAt(snapX, snapZ + 1, object)) + 0.5;
        }
      } else {
        if (!ignoreY) {
          if (isBlueprint) object.position.y = Math.max(bpHeightAt(snapX - 1, snapZ, object), bpHeightAt(snapX, snapZ, object), bpHeightAt(snapX + 1, snapZ, object)) + 0.5;
          else object.position.y = Math.max(heightAt(snapX - 1, snapZ, object), heightAt(snapX, snapZ, object), heightAt(snapX + 1, snapZ, object)) + 0.5;
        }
      }
    } else {
      if (!ignoreY) {
        if (isBlueprint) object.position.y = bpHeightAt(snapX, snapZ, object) + 0.5;
        else object.position.y = heightAt(snapX, snapZ, object) + 0.5;
      }
    }
    
    object.position.x = snapX;
    object.position.z = snapZ;
  }

  function addShape(type, quiet) {
    var object = makeLego(type, randomColor());
    var x = Math.round((Math.random() - 0.5) * 6);
    var z = Math.round((Math.random() - 0.5) * 6);
    if (type === "block") x = Math.floor(x) + 0.5;
    
    // Terapkan skala terkini global
    object.scale.set(currentGlobalScale, currentGlobalScale, currentGlobalScale);
    object.userData.scale = currentGlobalScale;
    
    object.position.set(x, heightAt(x, z, null) + 0.5, z);
    scene.add(object);
    objects.push(object);
    selectObject(object);
    checkBlueprintMatches();
    if (!quiet) showToast("Keping baru ditambahkan ke meja.");
    return object;
  }

  function selectObject(object) {
    if (selectedObject === object) return;
    if (selectedObject) {
      if (selectedObject.userData && selectedObject.userData.requiredType) {
        if (selectedObject.material && selectedObject.material.emissive) {
          selectedObject.material.emissive.setHex(0x000000);
        }
      } else {
        setObjectEmissive(selectedObject, 0x000000);
      }
    }
    selectedObject = object;
    if (selectedObject) {
      if (selectedObject.userData && selectedObject.userData.requiredType) {
        if (selectedObject.material && selectedObject.material.emissive) {
          selectedObject.material.emissive.setHex(0x333333);
        }
      } else {
        setObjectEmissive(selectedObject, 0x2b2815);
      }
    }
  }

  function setObjectEmissive(object, color) {
    object.traverse(function (child) {
      if (child.isMesh && child.material && child.material.emissive) child.material.emissive.setHex(color);
    });
  }

  function setObjectOpacity(object, opacity) {
    object.traverse(function (child) {
      if (child.isMesh && child.material) {
        if (object.userData.requiredType) {
          child.material.transparent = true;
          child.material.opacity = opacity < 1 ? opacity : 0.26;
        } else {
          child.material.transparent = opacity < 1;
          child.material.opacity = opacity;
        }
      }
    });
  }

  function removeObject(object) {
    scene.remove(object);
    objects = objects.filter(function (entry) { return entry !== object; });
    if (selectedObject === object) selectedObject = null;
  }

  var presets = {
    rumah: [
      [-1, .5, -1, "cube"], [1, .5, -1, "cube"], [-1, .5, 1, "cube"], [1, .5, 1, "cube"],
      [0, 1.5, -1, "block"], [0, 1.5, 1, "block"], [0, 2.5, 0, "pyramid"]
    ],
    gerbang: [[-1, .5, 0, "cube"], [-1, 1.5, 0, "cube"], [2, .5, 0, "cube"], [2, 1.5, 0, "cube"], [.5, 2.5, 0, "block"]],
    jembatan: [[-3, .5, 0, "cube"], [3, .5, 0, "cube"], [-1.5, 1.5, 0, "block"], [.5, 1.5, 0, "block"], [2.5, 1.5, 0, "block"]],
    menara: [[0, .5, 0, "cube"], [0, 1.5, 0, "cube"], [0, 2.5, 0, "cube"], [0, 3.5, 0, "sphere"]],
    piramida: [[-1, .5, -1, "cube"], [1, .5, -1, "cube"], [-1, .5, 1, "cube"], [1, .5, 1, "cube"], [0, 1.5, 0, "pyramid"]],
    tembok: [[0, .5, 0, "longblock"], [0, 1.5, 0, "longblock"], [0, 2.5, 0, "longblock"]]
  };

  function createBlueprint(x, y, z, type) {
    var geometry;
    if (type === "sphere") geometry = new THREE.SphereGeometry(0.47, 12, 10);
    else if (type === "pyramid") geometry = new THREE.ConeGeometry(0.68, 0.96, 4);
    else geometry = new THREE.BoxGeometry(type === "longblock" ? 2.94 : (type === "block" ? 1.94 : .94), .94, .94);
    
    var material = new THREE.MeshBasicMaterial({ color: 0x6fc5d8, transparent: true, opacity: .26, wireframe: true, depthWrite: false });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (type === "pyramid") mesh.rotation.y = Math.PI / 4;
    mesh.userData.requiredType = type;
    mesh.userData.filled = false;
    scene.add(mesh);
    blueprintObjects.push(mesh);
    return mesh;
  }

  function clearBlueprint() {
    blueprintObjects.forEach(function (object) { scene.remove(object); });
    blueprintObjects = [];
  }

  function loadPreset(name) {
    clearBlueprint();
    blueprintComplete = false;
    if (!name || !presets[name]) return;
    presets[name].forEach(function (item) { 
      var bp = createBlueprint(item[0], item[1], item[2], item[3]); 
      if (item[4]) bp.rotation.y = item[4]; 
    });
    showToast("Cetak biru siap. Isi setiap bentuk transparan.");
    checkBlueprintMatches();
  }

  function checkBlueprintMatches() {
    blueprintObjects.forEach(function (blueprint) {
      if (selectedObject !== blueprint) {
        blueprint.material.color.setHex(0x6fc5d8);
        blueprint.material.opacity = .26;
      }
      blueprint.userData.filled = false;
      objects.some(function (object) {
        var matches = Math.abs(object.position.x - blueprint.position.x) < .2 &&
          Math.abs(object.position.y - blueprint.position.y) < .2 &&
          Math.abs(object.position.z - blueprint.position.z) < .2 &&
          object.userData.type === blueprint.userData.requiredType;
        if (matches) {
          blueprint.material.color.setHex(0x78ad68);
          blueprint.material.opacity = .48;
          blueprint.userData.filled = true;
        }
        return matches;
      });
    });
    
    var isComplete = blueprintObjects.length && blueprintObjects.every(function (blueprint) { return blueprint.userData.filled; });
    if (isComplete && !blueprintComplete) {
      if (isGameActive) {
        var finalScore = doc.getElementById("challenge-score").textContent;
        var finalDetail = doc.getElementById("challenge-score-detail").textContent;
        stopTimer();
        playSynth('win');
        // Tampilkan score card dengan hasil akhir
        doc.getElementById("score-card").hidden = false;
        doc.getElementById("challenge-score").textContent = finalScore;
        doc.getElementById("challenge-score-detail").textContent = finalDetail + " 🎉 SELESAI!";
        showToast("Tantangan selesai! Skor: " + finalScore);
      } else {
        playSynth('win');
        showToast("Struktur selesai. Semua keping cocok.");
      }
    }
    blueprintComplete = isComplete;
  }

  function pointerFromClient(clientX, clientY) {
    pointer.x = (clientX / win.innerWidth) * 2 - 1;
    pointer.y = -(clientY / win.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  // Jika di mode creator, raycaster prioritas mendeteksi blueprint agar bisa diedit presisi
  function pickedObject(clientX, clientY, includeBlueprints) {
    pointerFromClient(clientX, clientY);
    var targetList = isCreatorMode ? blueprintObjects : objectMeshes(null);
    // Untuk hand gesture, kita juga perlu memilih blueprint objects
    if (!isCreatorMode && includeBlueprints && blueprintObjects.length) {
      targetList = targetList.concat(blueprintObjects);
    }
    var hits = raycaster.intersectObjects(targetList, false);
    return hits.length ? rootObject(hits[0].object) : null;
  }

  function pointOnGround(clientX, clientY, y) {
    pointerFromClient(clientX, clientY);
    dragPlane.set(new THREE.Vector3(0, 1, 0), -y);
    return raycaster.ray.intersectPlane(dragPlane, scratchPoint) ? scratchPoint : null;
  }

  function creatorClick(clientX, clientY) {
    var point = pointOnGround(clientX, clientY, 0);
    if (!point) return false;
    var type = doc.getElementById("creator-shape").value;
    var bp = createBlueprint(point.x, 0, point.z, type);
    snappedPlacement(bp, false);
    showToast("Satu titik pola ditambahkan.");
    return true;
  }

  function beginInteraction(clientX, clientY, pointerId) {
    activePointerId = pointerId;
    dragMoved = false;
    var object = pickedObject(clientX, clientY);
    
    if (object) {
      draggedObject = object;
      selectObject(object);
      setObjectOpacity(object, .72);
      playSynth('lift');
      return;
    }
    
    if (isCreatorMode) {
      if (creatorClick(clientX, clientY)) return;
    }

    orbiting = true;
    orbitStart.x = clientX;
    orbitStart.y = clientY;
    orbitOrigin.theta = cameraTheta;
    orbitOrigin.phi = cameraPhi;
  }

  function moveInteraction(clientX, clientY) {
    if (draggedObject) {
      var point = pointOnGround(clientX, clientY, Math.max(.5, draggedObject.position.y));
      if (point) {
        draggedObject.position.x = point.x;
        draggedObject.position.z = point.z;
        dragMoved = true;
      }
    } else if (orbiting) {
      cameraTheta = orbitOrigin.theta - (clientX - orbitStart.x) * .006;
      cameraPhi = Math.max(.16, Math.min(1.34, orbitOrigin.phi + (clientY - orbitStart.y) * .004));
      updateCameraPosition();
    }
  }

  function endInteraction() {
    if (draggedObject) {
      if (!dragMoved) {
        // Jika hanya di klik, kalkulasi ulang tanpa merubah sumbu Y
        snappedPlacement(draggedObject, true);
      } else {
        playSynth('drop');
        snappedPlacement(draggedObject, false);
      }
      setObjectOpacity(draggedObject, 1);
      
      if (Math.abs(draggedObject.position.x - trashPosition.x) < 1.2 && Math.abs(draggedObject.position.z - trashPosition.z) < 1.2) {
        if (draggedObject.userData.requiredType) {
          scene.remove(draggedObject);
          blueprintObjects = blueprintObjects.filter(function(b) { return b !== draggedObject; });
        } else {
          removeObject(draggedObject);
        }
        playSynth('trash');
        showToast("Dibuang ke zona bongkar.");
      } else {
        checkBlueprintMatches();
      }
    }
    draggedObject = null;
    orbiting = false;
    activePointerId = null;
  }

  var canvas = renderer.domElement;
  if (win.PointerEvent) {
    canvas.addEventListener("pointerdown", function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
      beginInteraction(event.clientX, event.clientY, event.pointerId);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (activePointerId === event.pointerId) moveInteraction(event.clientX, event.clientY);
    });
    canvas.addEventListener("pointerup", endInteraction);
    canvas.addEventListener("pointercancel", endInteraction);
  } else {
    canvas.addEventListener("mousedown", function (event) {
      beginInteraction(event.clientX, event.clientY, "mouse");
    });
    win.addEventListener("mousemove", function (event) { if (activePointerId === "mouse") moveInteraction(event.clientX, event.clientY); });
    win.addEventListener("mouseup", endInteraction);
    canvas.addEventListener("touchstart", function (event) {
      if (event.touches.length === 1) {
        beginInteraction(event.touches[0].clientX, event.touches[0].clientY, "touch");
      }
    }, { passive: true });
    canvas.addEventListener("touchmove", function (event) {
      if (event.touches.length === 1 && activePointerId === "touch") moveInteraction(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener("touchend", endInteraction, { passive: true });
  }

  canvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    cameraRadius = Math.max(7, Math.min(25, cameraRadius + event.deltaY * .012));
    updateCameraPosition();
  }, { passive: false });

  canvas.addEventListener("touchmove", function (event) {
    if (event.touches.length !== 2) { lastTouchDistance = 0; return; }
    var dx = event.touches[0].clientX - event.touches[1].clientX;
    var dy = event.touches[0].clientY - event.touches[1].clientY;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (lastTouchDistance) {
      cameraRadius = Math.max(7, Math.min(25, cameraRadius + (lastTouchDistance - distance) * .025));
      updateCameraPosition();
    }
    lastTouchDistance = distance;
  }, { passive: true });
  canvas.addEventListener("touchend", function () { lastTouchDistance = 0; }, { passive: true });

  function rotateSelected() {
    if (!selectedObject) return showToast("Pilih sebuah keping atau pola terlebih dahulu.");
    selectedObject.rotation.y += Math.PI / 2;
    // Rotasi mengabaikan sumbu Y (agar aman rotasi di dalam/dasar tumpukan)
    snappedPlacement(selectedObject, true);
    checkBlueprintMatches();
    playSynth('click');
    showToast("Berhasil diputar 90 derajat.");
  }

  win.addEventListener("keydown", function (event) {
    var key = String(event.key || "").toLowerCase();
    if (["w", "a", "s", "d", "r"].indexOf(key) === -1) return;
    if (/input|select|textarea/i.test(doc.activeElement.tagName)) return;
    event.preventDefault();
    if (key === "a") cameraTheta -= .14;
    if (key === "d") cameraTheta += .14;
    if (key === "w") cameraPhi = Math.min(1.34, cameraPhi + .08);
    if (key === "s") cameraPhi = Math.max(.16, cameraPhi - .08);
    if (key === "r") rotateSelected();
    updateCameraPosition();
  });

  function showToast(message) {
    var toast = doc.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimeout) win.clearTimeout(toastTimeout);
    toastTimeout = win.setTimeout(function () { toast.classList.remove("is-visible"); }, 2400);
  }

  function resetGrid(quiet) {
    objects.forEach(function (object) { scene.remove(object); });
    objects = [];
    selectedObject = null;
    checkBlueprintMatches();
    if (!quiet) showToast("Meja kerja sudah dibersihkan.");
  }

  function updateScoreDisplay() {
    var scoreEl = doc.getElementById("challenge-score");
    var detailEl = doc.getElementById("challenge-score-detail");
    if (!isGameActive) {
      doc.getElementById("score-card").hidden = true;
      return;
    }
    var used = totalTime - timeLeft;
    var score = Math.max(0, Math.round(((totalTime - used) / totalTime) * 100));
    scoreEl.textContent = score + "%";
    var stars = score >= 90 ? "⭐⭐⭐" : score >= 70 ? "⭐⭐" : score >= 40 ? "⭐" : "💪";
    detailEl.textContent = "Sisa " + timeLeft + "/" + totalTime + " detik " + stars;
    doc.getElementById("score-card").hidden = false;
  }

  function stopTimer() {
    if (gameTimer) win.clearInterval(gameTimer);
    gameTimer = null;
    isGameActive = false;
    doc.getElementById("timer-card").hidden = true;
    updateScoreDisplay();
  }

  function startTimerGame() {
    stopTimer();
    resetGrid(true);
    if (!blueprintObjects.length) {
      doc.getElementById("preset-select").value = "rumah";
      loadPreset("rumah");
    }
    timeLeft = parseInt(doc.getElementById("difficulty-select").value, 10) || 60;
    totalTime = timeLeft;
    isGameActive = true;
    doc.getElementById("timer-card").hidden = false;
    doc.getElementById("timer-value").textContent = timeLeft;
    showToast("Tantangan dimulai. Susun sesuai cetak biru.");
    updateScoreDisplay();
    gameTimer = win.setInterval(function () {
      timeLeft -= 1;
      doc.getElementById("timer-value").textContent = timeLeft;
      updateScoreDisplay();
      if (timeLeft <= 0) {
        stopTimer();
        playSynth('fail');
        showToast("Waktu habis. Skor akhir: " + doc.getElementById("challenge-score").textContent);
      }
    }, 1000);
  }

  function exportCreation() {
    if (!objects.length) return showToast("Belum ada keping untuk diekspor.");
    var data = objects.map(function (object) {
      return {
        type: object.userData.type,
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
        rotationY: object.rotation.y,
        scale: object.userData.scale || 1,
        color: "#" + new THREE.Color(object.userData.color).getHexString()
      };
    });
    var blob = new Blob([JSON.stringify({ version: 1, bricks: data }, null, 2)], { type: "application/json" });
    var url = win.URL && win.URL.createObjectURL ? win.URL.createObjectURL(blob) : null;
    var link = doc.createElement("a");
    link.download = "bricksmith-kreasi.json";
    link.href = url || "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ version: 1, bricks: data }));
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    if (url) win.setTimeout(function () { win.URL.revokeObjectURL(url); }, 500);
    showToast("File kreasi berhasil disiapkan.");
  }

  function importCreation(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (event) {
      try {
        var parsed = JSON.parse(event.target.result);
        var bricks = Array.isArray(parsed) ? parsed : parsed.bricks;
        if (!Array.isArray(bricks)) throw new Error("Invalid data");
        resetGrid(true);
        bricks.forEach(function (item) {
          if (["cube", "block", "longblock", "sphere", "pyramid"].indexOf(item.type) === -1) return;
          var color = new THREE.Color(item.color || "#d94a35").getHex();
          var object = makeLego(item.type, color);
          object.position.set(Number(item.x) || 0, Number(item.y) || .5, Number(item.z) || 0);
          object.rotation.y = Number(item.rotationY !== undefined ? item.rotationY : item.ry) || object.rotation.y;
          
          var scale = item.scale || 1;
          object.scale.set(scale, scale, scale);
          object.userData.scale = scale;

          scene.add(object);
          objects.push(object);
        });
        checkBlueprintMatches();
        showToast("Kreasi berhasil dimuat dari file.");
      } catch (error) {
        showToast("File tidak dikenali. Gunakan JSON dari Bricksmith.");
      }
    };
    reader.onerror = function () { showToast("Browser gagal membaca file tersebut."); };
    reader.readAsText(file);
  }

  function toggleCreatorMode() {
    isCreatorMode = !isCreatorMode;
    var button = doc.getElementById("creator-button");
    button.classList.toggle("is-active", isCreatorMode);
    button.textContent = isCreatorMode ? "Pola aktif" : "Gambar pola";
    showToast(isCreatorMode ? "Ketuk/geser pola transparan untuk edit posisinya." : "Mode gambar pola dinonaktifkan.");
    selectObject(null);
    closePanelOnMobile();
  }

  function openPanel() {
    var panel = doc.getElementById("control-panel");
    panel.classList.add("is-open");
    doc.getElementById("menu-button").setAttribute("aria-expanded", "true");
  }

  function closePanel() {
    doc.getElementById("control-panel").classList.remove("is-open");
    doc.getElementById("menu-button").setAttribute("aria-expanded", "false");
  }

  function closePanelOnMobile() {
    if (win.innerWidth <= 820) closePanel();
  }

  function openHelp() {
    var dialog = doc.getElementById("help-dialog");
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  function closeHelp() {
    var dialog = doc.getElementById("help-dialog");
    if (dialog.close) dialog.close();
    else dialog.removeAttribute("open");
  }

  doc.getElementById("save-preset-button").addEventListener("click", function() {
    if (objects.length === 0) return showToast("Meja kosong. Rakit sesuatu terlebih dahulu.");
    var presetData = objects.map(function(obj) {
      return [obj.position.x, obj.position.y, obj.position.z, obj.userData.type, obj.rotation.y];
    });
    var presetName = "custom_" + Date.now();
    presets[presetName] = presetData;
    var option = doc.createElement("option");
    option.value = presetName;
    var timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    option.textContent = "Pola Tersimpan (" + timeStr + ")";
    doc.getElementById("preset-select").appendChild(option);
    doc.getElementById("preset-select").value = presetName;
    showToast("Pola berhasil disimpan di menu Cetak Biru!");
  });

  // Slider diterapkan secara dinamis untuk SEMUA bricks yang terpasang
  var scaleSlider = doc.getElementById("brick-scale");
  var scaleVal = doc.getElementById("scale-val");
  scaleSlider.addEventListener("input", function(e) {
    scaleVal.textContent = e.target.value + "%";
    currentGlobalScale = parseInt(e.target.value) / 100;
    
    objects.forEach(function(obj) {
      obj.scale.set(currentGlobalScale, currentGlobalScale, currentGlobalScale);
      obj.userData.scale = currentGlobalScale;
    });
  });

  function handPick(clientX, clientY) {
    var object = pickedObject(clientX, clientY, true);
    if (!object) return null;
    selectObject(object);
    setObjectOpacity(object, .72);
    playSynth('lift');
    return object;
  }

  var handStates = [{ pinching: false, object: null }, { pinching: false, object: null }];
  var handCursorEls = null;
  var handActiveStatus = null;
  var handActiveButton = null;
  var handCameraStatus = null;
  var handCmdQueue = false; // throttle raycaster hit test
  var rGestureCooldown = 0;
  var rGestureFrameCount = 0;

  // Cache DOM elements untuk hand tracking
  function getHandNodes() {
    if (!handCursorEls) {
      handCursorEls = [doc.getElementById("hand-cursor-0"), doc.getElementById("hand-cursor-1")];
    }
    if (!handActiveStatus) handActiveStatus = doc.getElementById("input-status");
    if (!handActiveButton) handActiveButton = doc.getElementById("start-camera");
    if (!handCameraStatus) handCameraStatus = doc.getElementById("camera-status");
  }

  // Fungsi deteksi gesture "R" (telunjuk + jari tengah rapat dan tegak)
  function isRGesture(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;
    // Landmark index sesuai MediaPipe Hands:
    // 4: thumb tip, 8: index tip, 12: middle tip, 16: ring tip, 20: pinky tip
    // 6: index pip, 10: middle pip, 14: ring pip, 18: pinky pip
    var indexTip = landmarks[8];
    var indexPip = landmarks[6];
    var middleTip = landmarks[12];
    var middlePip = landmarks[10];
    var ringTip = landmarks[16];
    var ringPip = landmarks[14];
    var pinkyTip = landmarks[20];
    var pinkyPip = landmarks[18];

    // Telunjuk dan jari tengah harus terentang (tip di atas pip)
    var indexExtended = indexTip.y < indexPip.y;
    var middleExtended = middleTip.y < middlePip.y;
    // Jari manis dan kelingking harus ditekuk (tip di bawah pip)
    var ringBent = ringTip.y > ringPip.y;
    var pinkyBent = pinkyTip.y > pinkyPip.y;
    // Jarak antara telunjuk dan jari tengah rapat
    var dx = indexTip.x - middleTip.x;
    var dy = indexTip.y - middleTip.y;
    var distanceIM = Math.sqrt(dx * dx + dy * dy);
    var closeEnough = distanceIM < 0.04;

    return indexExtended && middleExtended && ringBent && pinkyBent && closeEnough;
  }

  function setCameraVisualState(state, title, detail) {
    getHandNodes();
    if (!handCameraStatus) return;
    handCameraStatus.className = "camera-status" + (state ? " is-active is-" + state : "");
    handCameraStatus.querySelector("strong").textContent = title || "KAMERA NONAKTIF";
    handCameraStatus.querySelector("small").textContent = detail || "";
  }

  function onHandResults(results) {
    getHandNodes();
    
    // Sembunyikan cursor dulu
    handCursorEls[0].style.display = "none";
    handCursorEls[1].style.display = "none";
    
    // Callback hasil pertama membuktikan kamera dan model AI sudah memproses
    // frame. Tangan boleh belum berada di depan kamera.
    var hasHands = results && results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    if (!handTrackingReady) {
      handTrackingReady = true;
      if (handStartupTimeout) win.clearTimeout(handStartupTimeout);
      handActiveStatus.classList.remove("is-off", "is-warning");
      handActiveStatus.innerHTML = "<i></i> Kamera AI aktif";
      handActiveButton.querySelector("span").textContent = "Kontrol tangan aktif";
      handActiveButton.querySelector("small").textContent = "Arahkan tangan ke kamera untuk mulai";
      showToast("Kamera AI aktif. Arahkan tangan ke kamera.");
    }
    
    if (!hasHands) {
      setCameraVisualState("ready", "KAMERA SIAP", "Arahkan tangan");
      return;
    }
    setCameraVisualState("hand-detected", "TANGAN TERDETEKSI", "Cubit & geser");
    
    // throttle: hanya lakukan hit test setiap 3 frame untuk hemat CPU
    handCmdQueue = !handCmdQueue;
    
    // Cooldown untuk gesture R (setiap ~20 frame = ~1,3 detik)
    if (rGestureCooldown > 0) rGestureCooldown--;
    
    results.multiHandLandmarks.slice(0, 2).forEach(function (landmarks, index) {
      var cursor = handCursorEls[index];
      if (!cursor) return;
      var x = (1 - (landmarks[8].x + landmarks[4].x) / 2) * win.innerWidth;
      var y = ((landmarks[8].y + landmarks[4].y) / 2) * win.innerHeight;
      var dx = landmarks[8].x - landmarks[4].x;
      var dy = landmarks[8].y - landmarks[4].y;
      var pinching = (dx * dx + dy * dy) < 0.0028; // sqrt(< .052) setara dengan < .052^2 = .0027
      var state = handStates[index];
      cursor.style.display = "block";
      cursor.style.left = x + "px";
      cursor.style.top = y + "px";
      
      // Set ikon tangan berdasarkan handedness
      var label = "KANAN";
      if (results.multiHandedness && results.multiHandedness[index]) {
        label = results.multiHandedness[index].label || "Right";
        label = label === "Right" ? "KANAN" : "KIRI";
      }
      cursor.setAttribute("data-hand", label);
      var iconSpan = cursor.querySelector(".hand-cursor__icon");
      if (iconSpan) {
        iconSpan.textContent = label === "KANAN" ? "👉" : "👈";
      }
      
      // Deteksi gesture "R" untuk rotasi dengan cooldown
      var rGestureDetected = isRGesture(landmarks);
      if (rGestureDetected) {
        cursor.setAttribute("data-action", "PUTAR");
        if (rGestureCooldown === 0 && !pinching) {
          // Pilih objek di bawah cursor dulu jika belum ada yang terpilih
          if (!selectedObject) {
            var hitObj = pickedObject(x, y, true);
            if (hitObj) selectObject(hitObj);
          }
          rotateSelected();
          rGestureCooldown = 20; // cooldown ~1,3 detik
        }
      } else {
        if (pinching) cursor.setAttribute("data-action", "CUBIT");
        else cursor.setAttribute("data-action", "GERAK");
      }
      
      if (pinching !== cursor.classList.contains("is-pinching")) {
        cursor.classList.toggle("is-pinching", pinching);
      }

      // Hit test hanya setiap 2 frame untuk kurangi beban raycaster
      if (handCmdQueue) {
        if (pinching && !state.pinching) state.object = handPick(x, y);
        if (pinching && state.object) {
          var point = pointOnGround(x, y, Math.max(.5, state.object.position.y));
          if (point) {
            state.object.position.x = point.x;
            state.object.position.z = point.z;
          }
        }
      }
      if (!pinching && state.pinching && state.object) {
        playSynth('drop');
        snappedPlacement(state.object, false);
        setObjectOpacity(state.object, 1);
        if (Math.abs(state.object.position.x - trashPosition.x) < 1.2 && Math.abs(state.object.position.z - trashPosition.z) < 1.2) {
            removeObject(state.object);
            playSynth('trash');
        }
        checkBlueprintMatches();
        state.object = null;
      }
      state.pinching = pinching;
    });
  }

  function setCameraInactive(message) {
    var button = doc.getElementById("start-camera");
    var status = doc.getElementById("input-status");
    status.classList.remove("is-warning");
    status.classList.add("is-off");
    status.innerHTML = "<i></i> Kontrol tangan belum aktif";
    button.disabled = false;
    button.querySelector("span").textContent = "Aktifkan kontrol tangan";
    button.querySelector("small").textContent = "Opsional · memerlukan kamera";
    setCameraVisualState("", "KAMERA NONAKTIF", "");
    if (message) showToast(message);
  }

  function stopHandCamera() {
    if (handFrameId) win.cancelAnimationFrame(handFrameId);
    handFrameId = null;
    if (handStartupTimeout) win.clearTimeout(handStartupTimeout);
    handStartupTimeout = null;
    handProcessing = false;
    if (handCursorEls) {
      handCursorEls.forEach(function (cursor) { cursor.style.display = "none"; });
    }
    handStates.forEach(function (state) { state.pinching = false; state.object = null; });
    var activeCamera = handCamera;
    var stream = cameraStream;
    handCamera = null;
    cameraStream = null;
    if (activeCamera && activeCamera.stop) activeCamera.stop();
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
    }
    var video = doc.getElementById("camera-feed");
    video.srcObject = null;
    video.classList.remove("is-active");
    setCameraVisualState("", "KAMERA NONAKTIF", "");
  }

  // Batasi framerate hand processing untuk menghemat CPU pada perangkat rendah
  var handFpsThrottle = 0;
  var HAND_TARGET_FPS = 15; // Turunkan ke 15fps dari 30+ untuk hemat CPU
  function processHandFrame() {
    var video = doc.getElementById("camera-feed");
    if (!cameraStream) {
      handFrameId = null;
      return;
    }
    // Throttle FPS: skip frame jika belum waktunya
    handFpsThrottle++;
    if (handFpsThrottle % Math.round(60 / HAND_TARGET_FPS) !== 0) {
      handFrameId = win.requestAnimationFrame(processHandFrame);
      return;
    }
    if (video.readyState >= 2 && !handProcessing) {
      handProcessing = true;
      try {
        handsController.send({ image: video }).then(function () {
          handProcessing = false;
          handFrameId = win.requestAnimationFrame(processHandFrame);
        }).catch(function (error) {
          console.error("MediaPipe Hands error:", error);
          handProcessing = false;
          // Jangan langsung stop, coba lagi di frame berikutnya
          handFrameId = win.requestAnimationFrame(processHandFrame);
        });
        return;
      } catch (error) {
        console.error("MediaPipe Hands error:", error);
        handProcessing = false;
        handFrameId = win.requestAnimationFrame(processHandFrame);
        return;
      }
    } else {
      handFrameId = win.requestAnimationFrame(processHandFrame);
    }
  }

  function startHandCamera() {
    var button = doc.getElementById("start-camera");
    var status = doc.getElementById("input-status");
    var video = doc.getElementById("camera-feed");
    
    // Jika kamera sudah aktif, matikan (toggle off)
    if (handCamera || cameraStream) {
      stopHandCamera();
      setCameraInactive("Kontrol tangan dimatikan.");
      return;
    }
    
    // Cek dukungan browser
    if (!win.Hands || !win.Camera) {
      setCameraInactive("Komponen kamera AI tidak tersedia di browser ini.");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraInactive("Kamera tidak didukung browser ini.");
      return;
    }
    // Kamera tetap bisa diakses di localhost, 127.0.0.1, file://, atau HTTPS
    // Catatan: beberapa browser membatasi kamera di file:// — live server (localhost) direkomendasikan
    var isLocalOrSecure = win.isSecureContext || 
      location.hostname === "localhost" || 
      location.hostname === "127.0.0.1" || 
      location.protocol === "file:" ||
      location.hostname === "";
    if (!isLocalOrSecure) {
      setCameraInactive("Kamera memerlukan HTTPS, localhost, atau live server.");
      return;
    }
    
    button.disabled = true;
    button.querySelector("span").textContent = "Menyiapkan kamera…";
    status.className = "status-chip is-warning";
    status.innerHTML = "<i></i> Meminta izin kamera…";
    handTrackingReady = false;
    
    // Mengikuti alur yang terbukti pada sukses.html: Camera menangani izin,
    // stream video, pemutaran video, dan pengiriman frame ke MediaPipe.
    try {
      handsController = new win.Hands({
        locateFile: function (file) { return "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/" + file; }
      });
      handsController.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      handsController.onResults(onHandResults);
      handCamera = new win.Camera(video, {
        onFrame: function () { return handsController.send({ image: video }); },
        width: 640,
        height: 480
      });
    } catch (initError) {
      console.error("MediaPipe init error:", initError);
      stopHandCamera();
      setCameraInactive("Gagal menyiapkan kamera AI.");
      return;
    }

    handCamera.start().then(function () {
      cameraStream = video.srcObject;
      video.classList.add("is-active");
      setCameraVisualState("loading", "MENYIAPKAN KAMERA", "Memuat AI");
      status.innerHTML = "<i></i> Memuat model AI…";
      if (cameraStream && cameraStream.getVideoTracks) {
        cameraStream.getVideoTracks().forEach(function (track) {
          track.addEventListener("ended", function () {
            if (cameraStream) {
              stopHandCamera();
              setCameraInactive("Kamera berhenti atau sedang dipakai aplikasi lain.");
            }
          });
        });
      }
      // Kamera boleh aktif meski tangan belum berada di depan lensa.
      handStartupTimeout = win.setTimeout(function () {
        if (!handTrackingReady) {
          stopHandCamera();
          setCameraInactive("Model AI tidak menerima frame kamera. Coba lagi.");
        }
      }, 15000);
    }).catch(function (error) {
      console.error("startHandCamera error:", error);
      stopHandCamera();
      var msg = error.name === "NotAllowedError" || error.name === "PermissionDeniedError" 
        ? "Izin kamera ditolak. Izinkan akses kamera di pengaturan browser."
        : "Kamera tidak tersedia atau gagal diakses.";
      setCameraInactive(msg);
    });
  }

  Array.prototype.forEach.call(doc.querySelectorAll("[data-add]"), function (button) {
    button.addEventListener("click", function () { addShape(button.getAttribute("data-add")); closePanelOnMobile(); });
  });
  doc.getElementById("preset-select").addEventListener("change", function (event) { loadPreset(event.target.value); });
  doc.getElementById("creator-button").addEventListener("click", toggleCreatorMode);
  doc.getElementById("undo-blueprint").addEventListener("click", function () {
    var last = blueprintObjects.pop();
    if (!last) return showToast("Belum ada titik pola untuk diurungkan.");
    scene.remove(last);
    checkBlueprintMatches();
    showToast("Titik pola terakhir diurungkan.");
  });
  doc.getElementById("start-game").addEventListener("click", function () { startTimerGame(); closePanelOnMobile(); });
  doc.getElementById("reset-button").addEventListener("click", function () { resetGrid(false); closePanelOnMobile(); });
  doc.getElementById("export-button").addEventListener("click", exportCreation);
  doc.getElementById("import-button").addEventListener("click", function () { doc.getElementById("import-input").click(); });
  doc.getElementById("import-input").addEventListener("change", function (event) { importCreation(event.target.files[0]); event.target.value = ""; });
  doc.getElementById("start-camera").addEventListener("click", startHandCamera);
  doc.getElementById("menu-button").addEventListener("click", openPanel);
  doc.getElementById("close-panel").addEventListener("click", closePanel);
  doc.getElementById("panel-scrim").addEventListener("click", closePanel);
  doc.getElementById("help-button").addEventListener("click", openHelp);
  doc.getElementById("close-help").addEventListener("click", closeHelp);
  doc.getElementById("rotate-brick").addEventListener("click", rotateSelected);
  doc.getElementById("rotate-left").addEventListener("click", function () { cameraTheta -= .18; updateCameraPosition(); });
  doc.getElementById("rotate-right").addEventListener("click", function () { cameraTheta += .18; updateCameraPosition(); });

  win.addEventListener("resize", function () {
    camera.aspect = win.innerWidth / win.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(win.innerWidth, win.innerHeight);
    renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2));
  });

  function animate() {
    win.requestAnimationFrame(animate);
    trashOutline.rotation.y += .004;
    renderer.render(scene, camera);
  }

  addShape("cube", true).position.set(-1, .5, 0);
  addShape("block", true).position.set(.5, .5, 1);
  addShape("sphere", true).position.set(2, .5, -1);
  selectObject(null);
  animate();
  win.setTimeout(function () { showToast("Seret keping untuk mulai membangun."); }, 550);
}());
