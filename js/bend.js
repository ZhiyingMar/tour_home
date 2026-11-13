// “滚筒世界”：让远处的地面向下弯，露出天空，看起来没有边界。
// 做法是给所有材质的顶点着色器加一小段：离镜头超过一定距离的顶点，按距离的平方往下沉。
// 必须在创建任何材质之前引入这个文件。
import * as THREE from 'three';

// x = 弯曲强度（0 就是平的，室内用 0），y = 从多远开始弯
export const bend = { value: new THREE.Vector2(0, 18) };
const FLAT = { value: new THREE.Vector2(0, 18) };

THREE.ShaderChunk.common = `uniform vec2 uBend;\n${THREE.ShaderChunk.common}`;
THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace(
  'gl_Position = projectionMatrix * mvPosition;',
  `float bendD = max(0.0, -mvPosition.z - uBend.y);
  mvPosition.y -= uBend.x * bendD * bendD;
  gl_Position = projectionMatrix * mvPosition;`,
);

// 精灵（光晕、烟）用的是另一套着色器，也要一起弯，不然远处的烟会飘在火车上空
THREE.ShaderLib.sprite.vertexShader = THREE.ShaderLib.sprite.vertexShader.replace(
  'gl_Position = projectionMatrix * mvPosition;',
  `float bendD = max(0.0, -mvPosition.z - uBend.y);
  mvPosition.y -= uBend.x * bendD * bendD;
  gl_Position = projectionMatrix * mvPosition;`,
);

// 阴影贴图是从灯的角度画的，不能跟着弯，否则影子会错位
THREE.Material.prototype.onBeforeCompile = function (shader) {
  shader.uniforms.uBend = this.isMeshDepthMaterial || this.isMeshDistanceMaterial ? FLAT : bend;
};
