const MODEL_URL = "assets/models/cessna172.glb";

const canvas = document.querySelector("#aircraftModelCanvas");
const statusEl = document.querySelector("#modelStatus");
const resetButton = document.querySelector("#modelReset");

const viewer = {
  gl: null,
  program: null,
  parts: [],
  center: [0, 0, 0],
  target: [0, 0, 0],
  radius: 1,
  yaw: -0.65,
  pitch: 0.22,
  distance: 4,
  pointer: null,
  lastTouchDistance: 0,
  lastTouchCenter: null,
  pointers: new Map(),
  animationId: 0
};

initModelViewer().catch((error) => {
  console.error(error);
  setStatus("Model could not load");
});

async function initModelViewer() {
  if (!canvas) return;

  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) {
    setStatus("3D is not available in this browser");
    return;
  }

  viewer.gl = gl;
  viewer.program = createProgram(gl);

  const model = await loadGlb(MODEL_URL);
  const materialTextures = await loadMaterialTextures(gl, model);
  viewer.parts = buildRenderableParts(gl, model, materialTextures);
  fitCameraToParts(viewer.parts);
  bindViewerControls();
  canvas.dataset.modelReady = "true";
  canvas.dataset.modelParts = String(viewer.parts.length);
  canvas.dataset.modelTriangles = String(Math.round(viewer.parts.reduce((sum, part) => sum + part.count / 3, 0)));
  canvas.dataset.modelTextures = String(materialTextures.textureCount);
  hideStatus();
  requestDraw();

  window.c172ModelViewer = {
    reset: resetView,
    rotateForTest: () => {
      viewer.yaw += 0.45;
      requestDraw();
    },
    stats: () => ({
      parts: viewer.parts.length,
      triangles: viewer.parts.reduce((sum, part) => sum + part.count / 3, 0),
      textures: viewer.parts.filter((part) => part.hasTexture).length,
      radius: viewer.radius
    })
  };
}

async function loadGlb(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url}`);

  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Invalid GLB file");
  if (view.getUint32(4, true) !== 2) throw new Error("Only GLB v2 is supported");

  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunk = buffer.slice(chunkStart, chunkStart + chunkLength);

    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(chunk).trim());
    } else if (chunkType === 0x004e4942) {
      bin = chunk;
    }

    offset = chunkStart + chunkLength;
  }

  if (!json || !bin) throw new Error("GLB is missing required chunks");
  return { json, bin };
}

async function loadMaterialTextures(gl, model) {
  const fallbackTexture = createSolidTexture(gl, [255, 255, 255, 255]);
  const textureCache = new Map();
  const materials = [];

  for (let index = 0; index < (model.json.materials || []).length; index++) {
    const material = model.json.materials[index];
    const color = materialColor(material);
    const textureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
    let texture = fallbackTexture;
    let hasTexture = false;

    if (Number.isInteger(textureIndex)) {
      if (!textureCache.has(textureIndex)) {
        textureCache.set(textureIndex, await createGlTexture(gl, model, textureIndex));
      }
      texture = textureCache.get(textureIndex);
      hasTexture = true;
    }

    materials[index] = {
      texture,
      hasTexture,
      color,
      transparent: material?.alphaMode === "BLEND" || color[3] < 0.98,
      contrast: materialContrast(material?.name || "")
    };
  }

  return { fallbackTexture, materials, textureCount: textureCache.size };
}

async function createGlTexture(gl, model, textureIndex) {
  const textureDef = model.json.textures[textureIndex];
  const imageDef = model.json.images[textureDef.source];
  const sampler = model.json.samplers?.[textureDef.sampler] || {};
  const view = model.json.bufferViews[imageDef.bufferView];
  const byteOffset = view.byteOffset || 0;
  const byteLength = view.byteLength;
  const bytes = model.bin.slice(byteOffset, byteOffset + byteLength);
  const blob = new Blob([bytes], { type: imageDef.mimeType || "image/png" });
  const image = await createImageBitmap(blob);
  const texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, sampler.wrapS || gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, sampler.wrapT || gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sampler.magFilter || gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sampler.minFilter || gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  image.close?.();

  return texture;
}

function createSolidTexture(gl, rgba) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function buildRenderableParts(gl, model, materialTextures) {
  const parts = [];
  const scene = model.json.scenes?.[model.json.scene || 0];
  const roots = scene?.nodes || [];
  const identity = mat4Identity();

  roots.forEach((nodeIndex) => traverseNode(model, nodeIndex, identity, parts, materialTextures));

  parts.forEach((part) => {
    part.positionBuffer = makeBuffer(gl, gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);
    part.normalBuffer = makeBuffer(gl, gl.ARRAY_BUFFER, part.normals, gl.STATIC_DRAW);
    part.texcoordBuffer = makeBuffer(gl, gl.ARRAY_BUFFER, part.texcoords, gl.STATIC_DRAW);
    part.indexBuffer = makeBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);
    part.count = part.indices.length;
  });

  return parts;
}

function traverseNode(model, nodeIndex, parentMatrix, parts, materialTextures) {
  const node = model.json.nodes[nodeIndex];
  const worldMatrix = mat4Multiply(parentMatrix, nodeLocalMatrix(node));

  if (Number.isInteger(node.mesh)) {
    const mesh = model.json.meshes[node.mesh];
    mesh.primitives.forEach((primitive) => {
      if (primitive.mode !== undefined && primitive.mode !== 4) return;
      const part = primitiveToPart(model, primitive, worldMatrix, materialTextures);
      if (part) parts.push(part);
    });
  }

  (node.children || []).forEach((childIndex) => traverseNode(model, childIndex, worldMatrix, parts, materialTextures));
}

function primitiveToPart(model, primitive, worldMatrix, materialTextures) {
  const positionAccessor = primitive.attributes?.POSITION;
  if (!Number.isInteger(positionAccessor)) return null;

  const positions = readAccessor(model, positionAccessor);
  const normals = Number.isInteger(primitive.attributes.NORMAL)
    ? readAccessor(model, primitive.attributes.NORMAL)
    : null;
  const texcoords = Number.isInteger(primitive.attributes.TEXCOORD_0)
    ? readAccessor(model, primitive.attributes.TEXCOORD_0)
    : new Float32Array((positions.length / 3) * 2);
  const indices = Number.isInteger(primitive.indices)
    ? readIndices(model, primitive.indices)
    : sequentialIndices(positions.length / 3);
  const material = materialTextures.materials[primitive.material] || {
    texture: materialTextures.fallbackTexture,
    hasTexture: false,
    color: [0.82, 0.84, 0.8, 1],
    transparent: false,
    contrast: 1
  };

  const transformedPositions = new Float32Array(positions.length);
  const transformedNormals = normals ? new Float32Array(normals.length) : null;

  for (let i = 0; i < positions.length; i += 3) {
    const p = transformPoint(worldMatrix, positions[i], positions[i + 1], positions[i + 2]);
    transformedPositions[i] = p[0];
    transformedPositions[i + 1] = p[1];
    transformedPositions[i + 2] = p[2];

    if (transformedNormals) {
      const n = transformDirection(worldMatrix, normals[i], normals[i + 1], normals[i + 2]);
      transformedNormals[i] = n[0];
      transformedNormals[i + 1] = n[1];
      transformedNormals[i + 2] = n[2];
    }
  }

  return {
    positions: transformedPositions,
    normals: transformedNormals || buildNormals(transformedPositions, indices),
    texcoords,
    indices,
    color: material.color,
    texture: material.texture,
    hasTexture: material.hasTexture,
    transparent: material.transparent,
    contrast: material.contrast
  };
}

function readAccessor(model, accessorIndex) {
  const accessor = model.json.accessors[accessorIndex];
  const view = model.json.bufferViews[accessor.bufferView];
  const componentCount = componentCountForType(accessor.type);
  const componentSize = componentSizeForType(accessor.componentType);
  const itemSize = componentCount * componentSize;
  const stride = view.byteStride || itemSize;
  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const dataView = new DataView(model.bin, byteOffset, accessor.count * stride);
  const values = new Float32Array(accessor.count * componentCount);

  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < componentCount; c++) {
      values[i * componentCount + c] = readComponent(dataView, i * stride + c * componentSize, accessor.componentType, accessor.normalized);
    }
  }

  return values;
}

function readIndices(model, accessorIndex) {
  const accessor = model.json.accessors[accessorIndex];
  const view = model.json.bufferViews[accessor.bufferView];
  const componentSize = componentSizeForType(accessor.componentType);
  const stride = view.byteStride || componentSize;
  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const dataView = new DataView(model.bin, byteOffset, accessor.count * stride);
  const values = new Uint32Array(accessor.count);

  for (let i = 0; i < accessor.count; i++) {
    values[i] = readIndexComponent(dataView, i * stride, accessor.componentType);
  }

  return values;
}

function readComponent(view, offset, type, normalized) {
  if (type === 5126) return view.getFloat32(offset, true);
  if (type === 5125) return normalized ? view.getUint32(offset, true) / 4294967295 : view.getUint32(offset, true);
  if (type === 5123) return normalized ? view.getUint16(offset, true) / 65535 : view.getUint16(offset, true);
  if (type === 5122) return normalized ? Math.max(view.getInt16(offset, true) / 32767, -1) : view.getInt16(offset, true);
  if (type === 5121) return normalized ? view.getUint8(offset) / 255 : view.getUint8(offset);
  if (type === 5120) return normalized ? Math.max(view.getInt8(offset) / 127, -1) : view.getInt8(offset);
  throw new Error(`Unsupported component type ${type}`);
}

function readIndexComponent(view, offset, type) {
  if (type === 5125) return view.getUint32(offset, true);
  if (type === 5123) return view.getUint16(offset, true);
  if (type === 5121) return view.getUint8(offset);
  throw new Error(`Unsupported index type ${type}`);
}

function componentCountForType(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type] || 1;
}

function componentSizeForType(type) {
  return { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[type];
}

function sequentialIndices(count) {
  const values = new Uint32Array(count);
  for (let i = 0; i < count; i++) values[i] = i;
  return values;
}

function buildNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const a = [positions[ia], positions[ia + 1], positions[ia + 2]];
    const b = [positions[ib], positions[ib + 1], positions[ib + 2]];
    const c = [positions[ic], positions[ic + 1], positions[ic + 2]];
    const normal = vec3Normalize(vec3Cross(vec3Sub(b, a), vec3Sub(c, a)));
    [ia, ib, ic].forEach((index) => {
      normals[index] += normal[0];
      normals[index + 1] += normal[1];
      normals[index + 2] += normal[2];
    });
  }

  for (let i = 0; i < normals.length; i += 3) {
    const n = vec3Normalize([normals[i], normals[i + 1], normals[i + 2]]);
    normals[i] = n[0];
    normals[i + 1] = n[1];
    normals[i + 2] = n[2];
  }

  return normals;
}

function materialColor(material) {
  const name = (material?.name || "").toLowerCase();
  const factor = material?.pbrMetallicRoughness?.baseColorFactor;
  const hasTexture = Number.isInteger(material?.pbrMetallicRoughness?.baseColorTexture?.index);

  if (factor && factor.length >= 3 && factor[0] + factor[1] + factor[2] > 0.04) {
    return [factor[0], factor[1], factor[2], factor[3] ?? 1];
  }

  if (hasTexture) return [1, 1, 1, 1];
  if (name.includes("glass") || name.includes("window")) return [0.34, 0.62, 0.72, 0.72];
  if (name.includes("wheel") || name.includes("tire") || name.includes("button")) return [0.03, 0.03, 0.035, 1];
  if (name.includes("seat") || name.includes("interior")) return [0.22, 0.24, 0.27, 1];
  if (name.includes("steering") || name.includes("metal")) return [0.62, 0.64, 0.66, 1];
  return [0.82, 0.84, 0.8, 1];
}

function materialContrast(name) {
  const lower = name.toLowerCase();
  if (lower.includes("body")) return 1.75;
  if (lower.includes("paddle")) return 1.45;
  if (lower.includes("glass")) return 1.15;
  if (lower.includes("meter") || lower.includes("interior")) return 1.35;
  return 1.25;
}

function fitCameraToParts(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  parts.forEach((part) => {
    for (let i = 0; i < part.positions.length; i += 3) {
      min[0] = Math.min(min[0], part.positions[i]);
      min[1] = Math.min(min[1], part.positions[i + 1]);
      min[2] = Math.min(min[2], part.positions[i + 2]);
      max[0] = Math.max(max[0], part.positions[i]);
      max[1] = Math.max(max[1], part.positions[i + 1]);
      max[2] = Math.max(max[2], part.positions[i + 2]);
    }
  });

  viewer.center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  viewer.target = [...viewer.center];
  viewer.radius = Math.max(vec3Length(vec3Sub(max, min)) / 2, 1);
  viewer.distance = viewer.radius * 1.45;
}

function bindViewerControls() {
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  resetButton?.addEventListener("click", resetView);
  window.addEventListener("resize", requestDraw);
}

function onPointerDown(event) {
  canvas.setPointerCapture(event.pointerId);
  viewer.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewer.pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    mode: event.button === 2 || event.shiftKey ? "pan" : "rotate"
  };
  updateTouchGestureState();
}

function onPointerMove(event) {
  if (!viewer.pointers.has(event.pointerId)) return;
  viewer.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (viewer.pointers.size >= 2) {
    handleTouchGesture();
    requestDraw();
    return;
  }

  if (!viewer.pointer || viewer.pointer.id !== event.pointerId) return;

  const dx = event.clientX - viewer.pointer.x;
  const dy = event.clientY - viewer.pointer.y;
  viewer.pointer.x = event.clientX;
  viewer.pointer.y = event.clientY;

  if (viewer.pointer.mode === "pan") panCamera(dx, dy);
  else rotateCamera(dx, dy);

  requestDraw();
}

function onPointerUp(event) {
  viewer.pointers.delete(event.pointerId);
  if (viewer.pointer?.id === event.pointerId) viewer.pointer = null;
  updateTouchGestureState();
}

function updateTouchGestureState() {
  const points = [...viewer.pointers.values()];
  if (points.length >= 2) {
    viewer.lastTouchDistance = pointerDistance(points[0], points[1]);
    viewer.lastTouchCenter = pointerCenter(points[0], points[1]);
  } else {
    viewer.lastTouchDistance = 0;
    viewer.lastTouchCenter = null;
  }
}

function handleTouchGesture() {
  const points = [...viewer.pointers.values()];
  const distance = pointerDistance(points[0], points[1]);
  const center = pointerCenter(points[0], points[1]);

  if (viewer.lastTouchDistance) {
    viewer.distance *= viewer.lastTouchDistance / Math.max(distance, 1);
    viewer.distance = clamp(viewer.distance, viewer.radius * 0.35, viewer.radius * 7);
  }

  if (viewer.lastTouchCenter) {
    panCamera(center.x - viewer.lastTouchCenter.x, center.y - viewer.lastTouchCenter.y);
  }

  viewer.lastTouchDistance = distance;
  viewer.lastTouchCenter = center;
}

function rotateCamera(dx, dy) {
  viewer.yaw += dx * 0.006;
  viewer.pitch = clamp(viewer.pitch + dy * 0.006, -1.35, 1.35);
}

function panCamera(dx, dy) {
  const camera = cameraState();
  const scale = (2 * Math.tan(Math.PI / 8) * viewer.distance) / Math.max(canvas.clientHeight, 1);
  viewer.target = vec3Add(viewer.target, vec3Scale(camera.right, -dx * scale));
  viewer.target = vec3Add(viewer.target, vec3Scale(camera.up, dy * scale));
}

function onWheel(event) {
  event.preventDefault();
  viewer.distance *= Math.exp(event.deltaY * 0.001);
  viewer.distance = clamp(viewer.distance, viewer.radius * 0.35, viewer.radius * 7);
  requestDraw();
}

function resetView() {
  viewer.target = [...viewer.center];
  viewer.yaw = -0.65;
  viewer.pitch = 0.22;
  viewer.distance = viewer.radius * 1.45;
  requestDraw();
}

function requestDraw() {
  if (viewer.animationId) return;
  viewer.animationId = requestAnimationFrame(() => {
    viewer.animationId = 0;
    drawScene();
  });
}

function drawScene() {
  const gl = viewer.gl;
  if (!gl || !viewer.program || !viewer.parts.length) return;

  resizeCanvasToDisplaySize(canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const camera = cameraState();
  const aspect = canvas.width / Math.max(canvas.height, 1);
  const projection = mat4Perspective(Math.PI / 4, aspect, viewer.radius * 0.01, viewer.radius * 20);
  const view = mat4LookAt(camera.eye, viewer.target, camera.up);
  const viewProjection = mat4Multiply(projection, view);

  gl.useProgram(viewer.program.program);
  gl.uniformMatrix4fv(viewer.program.uniforms.viewProjection, false, viewProjection);
  gl.uniform3fv(viewer.program.uniforms.lightDir, new Float32Array(vec3Normalize([0.4, 0.75, 0.55])));
  gl.uniform1i(viewer.program.uniforms.baseTexture, 0);

  viewer.parts.forEach((part) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, part.positionBuffer);
    gl.enableVertexAttribArray(viewer.program.attributes.position);
    gl.vertexAttribPointer(viewer.program.attributes.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, part.normalBuffer);
    gl.enableVertexAttribArray(viewer.program.attributes.normal);
    gl.vertexAttribPointer(viewer.program.attributes.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, part.texcoordBuffer);
    gl.enableVertexAttribArray(viewer.program.attributes.texcoord);
    gl.vertexAttribPointer(viewer.program.attributes.texcoord, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.indexBuffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, part.texture);
    gl.uniform4fv(viewer.program.uniforms.color, new Float32Array(part.color));
    gl.uniform1i(viewer.program.uniforms.hasTexture, part.hasTexture ? 1 : 0);
    gl.uniform1f(viewer.program.uniforms.contrast, part.contrast || 1);
    gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
  });
}

function cameraState() {
  const cosPitch = Math.cos(viewer.pitch);
  const eye = [
    viewer.target[0] + viewer.distance * Math.sin(viewer.yaw) * cosPitch,
    viewer.target[1] + viewer.distance * Math.sin(viewer.pitch),
    viewer.target[2] + viewer.distance * Math.cos(viewer.yaw) * cosPitch
  ];
  const forward = vec3Normalize(vec3Sub(viewer.target, eye));
  const right = vec3Normalize(vec3Cross(forward, [0, 1, 0]));
  const up = vec3Normalize(vec3Cross(right, forward));
  return { eye, right, up };
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec3 aPosition;
    in vec3 aNormal;
    in vec2 aTexcoord;
    uniform mat4 uViewProjection;
    out vec3 vNormal;
    out vec2 vTexcoord;
    out float vDepth;
    void main() {
      vec4 clip = uViewProjection * vec4(aPosition, 1.0);
      gl_Position = clip;
      vNormal = normalize(aNormal);
      vTexcoord = aTexcoord;
      vDepth = clip.z / clip.w;
    }
  `);

  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec3 vNormal;
    in vec2 vTexcoord;
    in float vDepth;
    uniform vec4 uColor;
    uniform vec3 uLightDir;
    uniform sampler2D uBaseTexture;
    uniform bool uHasTexture;
    uniform float uContrast;
    out vec4 outColor;
    void main() {
      vec3 n = normalize(vNormal);
      float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
      float fill = max(dot(n, normalize(vec3(-0.65, 0.38, -0.32))), 0.0);
      float underside = max(dot(n, normalize(vec3(0.05, -0.5, -0.25))), 0.0);
      float rim = pow(1.0 - max(abs(n.z), 0.0), 2.0) * 0.06;
      vec4 texel = uHasTexture ? texture(uBaseTexture, vTexcoord) : vec4(1.0);
      vec3 enhancedTexel = clamp((texel.rgb - vec3(0.5)) * uContrast + vec3(0.5), 0.0, 1.0);
      enhancedTexel = mix(enhancedTexel, pow(enhancedTexel, vec3(0.86)), 0.35);
      vec3 base = uColor.rgb * enhancedTexel;
      vec3 color = base * (0.78 + diffuse * 0.42 + fill * 0.22 + underside * 0.12) + vec3(rim);
      color += vec3(pow(max(dot(reflect(-normalize(uLightDir), n), normalize(vec3(0.0, 0.2, 1.0))), 0.0), 24.0)) * 0.05;
      float alpha = uColor.a * texel.a;
      if (alpha < 0.04) discard;
      outColor = vec4(color, alpha);
    }
  `);

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }

  return {
    program,
    attributes: {
      position: gl.getAttribLocation(program, "aPosition"),
      normal: gl.getAttribLocation(program, "aNormal"),
      texcoord: gl.getAttribLocation(program, "aTexcoord")
    },
    uniforms: {
      viewProjection: gl.getUniformLocation(program, "uViewProjection"),
      color: gl.getUniformLocation(program, "uColor"),
      lightDir: gl.getUniformLocation(program, "uLightDir"),
      baseTexture: gl.getUniformLocation(program, "uBaseTexture"),
      hasTexture: gl.getUniformLocation(program, "uHasTexture"),
      contrast: gl.getUniformLocation(program, "uContrast")
    }
  };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function makeBuffer(gl, target, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, usage);
  return buffer;
}

function resizeCanvasToDisplaySize(targetCanvas) {
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
  const width = Math.floor(targetCanvas.clientWidth * ratio);
  const height = Math.floor(targetCanvas.clientHeight * ratio);
  if (targetCanvas.width !== width || targetCanvas.height !== height) {
    targetCanvas.width = width;
    targetCanvas.height = height;
  }
}

function nodeLocalMatrix(node) {
  if (node.matrix) return new Float32Array(node.matrix);

  const translation = node.translation || [0, 0, 0];
  const rotation = node.rotation || [0, 0, 0, 1];
  const scale = node.scale || [1, 1, 1];
  return mat4FromTrs(translation, rotation, scale);
}

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat4FromTrs(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ]);
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function mat4LookAt(eye, center, up) {
  const z = vec3Normalize(vec3Sub(eye, center));
  const x = vec3Normalize(vec3Cross(up, z));
  const y = vec3Cross(z, x);

  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -vec3Dot(x, eye), -vec3Dot(y, eye), -vec3Dot(z, eye), 1
  ]);
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

function transformDirection(m, x, y, z) {
  return vec3Normalize([
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z
  ]);
}

function vec3Sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Scale(a, scale) {
  return [a[0] * scale, a[1] * scale, a[2] * scale];
}

function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function vec3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function vec3Normalize(a) {
  const length = vec3Length(a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerCenter(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(text) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.remove("is-hidden");
}

function hideStatus() {
  statusEl?.classList.add("is-hidden");
}
