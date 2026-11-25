// GLB modelleri yükler (meshopt sıkıştırmalı). Her model bir kez yüklenir, sonra klonlanır.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const FILES = {
  player: 'assets/models/player.glb',
  wolf: 'assets/models/wolf.glb',
  dragon: 'assets/models/dragon.glb',
};

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const keys = Object.keys(FILES);
  const loaded = {};
  const prog = {};
  await Promise.all(keys.map(async (k) => {
    loaded[k] = await loader.loadAsync(FILES[k], (e) => {
      if (e.total) { prog[k] = e.loaded / e.total; onProgress && onProgress(keys.reduce((s, kk) => s + (prog[kk] || 0), 0) / keys.length); }
    });
    prog[k] = 1;
    onProgress && onProgress(keys.reduce((s, kk) => s + (prog[kk] || 0), 0) / keys.length);
  }));
  return loaded;
}
