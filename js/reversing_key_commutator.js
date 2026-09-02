import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addTerminal, COMMUTATOR_TERMINAL_POSITIONS } from './terminal-utils.js';

const apparatusHost = document.getElementById('commutator-canvas-container');
if (!apparatusHost) throw new Error('commutator-canvas-container not found');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d8d8);
scene.fog = new THREE.Fog(0xd8d8d8, 20, 50);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 8, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.setSize(1, 1);
apparatusHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 + 0.1;

scene.add(new THREE.HemisphereLight(0xffffff, 0x5b6470, 1.6));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(8, 15, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.9);
fillLight.position.set(-8, 8, -8);
scene.add(fillLight);

const blackPlasticMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.5, metalness: 0.1 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, metalness: 0.72, roughness: 0.3 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc59b27, metalness: 0.85, roughness: 0.25 });

function createBrassTerminal() {
	const group = new THREE.Group();
	const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 32), brassMat);
	nut.position.y = 0.1;
	const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 16), brassMat);
	post.position.y = 0.5;
	const topNut = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 32), brassMat);
	topNut.position.y = 0.7;
	group.add(nut, post, topNut);
	group.traverse(child => { if (child.isMesh) child.castShadow = true; });
	return group;
}

const mainGroup = new THREE.Group();
const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.1, 1.5, 64), blackPlasticMat);
base.position.y = 0.75;
base.castShadow = base.receiveShadow = true;
mainGroup.add(base);

const plateShape = new THREE.Shape();
plateShape.absarc(0, 0, 3.8, -Math.PI / 3.2, Math.PI / 3.2, false);
plateShape.absarc(0, 0, 2.2, Math.PI / 3.2, -Math.PI / 3.2, true);
const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
	depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3
});
for (const rotation of [0, Math.PI]) {
	const plate = new THREE.Mesh(plateGeo, metalMat);
	plate.rotation.set(-Math.PI / 2, 0, rotation);
	plate.position.y = 1.5;
	plate.castShadow = plate.receiveShadow = true;
	mainGroup.add(plate);
}

const centerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 16), metalMat);
centerPin.position.y = 2.3;
centerPin.castShadow = true;
mainGroup.add(centerPin);
for (let index = 0; index < 8; index += 1) {
	const coil = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 16, 32), metalMat);
	coil.rotation.x = Math.PI / 2;
	coil.position.y = 1.7 + index * 0.18;
	coil.castShadow = true;
	mainGroup.add(coil);
}

const armGroup = new THREE.Group();
armGroup.name = 'commutator-arm';
armGroup.position.y = 3.25;
const armBar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 1.3), blackPlasticMat);
armBar.castShadow = true;
armGroup.add(armBar);
const armHub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.82, 32), blackPlasticMat);
armHub.castShadow = true;
armGroup.add(armHub);
const pivotScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16), metalMat);
pivotScrew.position.y = 0.42;
armGroup.add(pivotScrew);
const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 3.5, 32), blackPlasticMat);
handle.rotation.z = -Math.PI / 2;
handle.position.x = 5.25;
handle.castShadow = true;
const handleTip = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), blackPlasticMat);
handleTip.position.y = 1.75;
handle.add(handleTip);
armGroup.add(handle);

const contactLength = 1.35;
const contactPin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, contactLength, 16), metalMat);
contactPin.position.set(-2.5, -0.28 - contactLength / 2, 0);
contactPin.castShadow = true;
armGroup.add(contactPin);
const contactPin2 = contactPin.clone();
contactPin2.position.x = 2.5;
armGroup.add(contactPin2);
for (const terminalInfo of COMMUTATOR_TERMINAL_POSITIONS.handle) {
	const terminal = createBrassTerminal();
	terminal.position.set(terminalInfo.position.x, 0.4, terminalInfo.position.z);
	addTerminal(terminal, terminalInfo.id, new THREE.Vector3(0, 0.7, 0), terminalInfo.color);
	armGroup.add(terminal);
}
armGroup.rotation.y = Math.PI * 0.2;
mainGroup.add(armGroup);

const postGroup = new THREE.Group();
for (const terminalInfo of COMMUTATOR_TERMINAL_POSITIONS.plate) {
	const post = new THREE.Group();
	post.position.set(terminalInfo.position.x, terminalInfo.position.y - 0.7, terminalInfo.position.z);
	const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 24), blackPlasticMat);
	const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 16), brassMat);
	pin.position.y = 0.35;
	const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 24), brassMat);
	nut.position.y = 0.68;
	post.add(collar, pin, nut);
	addTerminal(post, terminalInfo.id, new THREE.Vector3(0, 0.7, 0), terminalInfo.color);
	postGroup.add(post);
}
mainGroup.add(postGroup);
scene.add(mainGroup);

let currentPosition = 0;
const angles = [Math.PI * 0.2, Math.PI * 0.8];
const statusLabel = document.getElementById('status-label');
const polarityAnimations = new WeakMap();

function publishPolarity(position = currentPosition) {
	window.dispatchEvent(new CustomEvent('commutator:polarity-change', {
		detail: { position, polarity: position === 0 ? 1 : -1 }
	}));
}

export function togglePolarity(model = mainGroup) {
	const targetModel = typeof model?.getObjectByName === 'function' ? model : mainGroup;
	const arm = targetModel.getObjectByName('commutator-arm');
	if (!arm) return;
	const previous = polarityAnimations.get(targetModel) || { position: currentPosition };
	const position = previous.position === 0 ? 1 : 0;
	currentPosition = position;
	polarityAnimations.set(targetModel, {
		position,
		from: arm.rotation.y,
		to: angles[position],
		start: performance.now()
	});
	if (statusLabel) statusLabel.textContent = position === 0
		? 'Position: Polarity A (+ / -)' : 'Position: Polarity B (- / +)';
	publishPolarity(position);
}
document.getElementById('btn-toggle')?.addEventListener('click', togglePolarity);
window.addEventListener('commutator:toggle', togglePolarity);

export function updatePolarityAnimation(model, now = performance.now()) {
	const arm = model?.getObjectByName('commutator-arm');
	const animation = polarityAnimations.get(model);
	if (!arm || !animation) return;
	const progress = Math.min((now - animation.start) / 1200, 1);
	const eased = 1 - Math.pow(1 - progress, 3);
	arm.rotation.y = animation.from + (animation.to - animation.from) * eased;
	const armProgress = (arm.rotation.y - angles[0]) / (angles[1] - angles[0]);
	arm.position.y = 3.25 - Math.sin(armProgress * Math.PI) * 0.15;
	if (progress === 1) polarityAnimations.delete(model);
}

export function setPolarityAngle(model, angle) {
	const targetModel = typeof model?.getObjectByName === 'function' ? model : mainGroup;
	const arm = targetModel.getObjectByName('commutator-arm');
	if (!arm) return;
	arm.rotation.y = angle;
	polarityAnimations.delete(targetModel);
}

export function snapPolarity(model = mainGroup) {
	const targetModel = typeof model?.getObjectByName === 'function' ? model : mainGroup;
	const arm = targetModel.getObjectByName('commutator-arm');
	if (!arm) return;
	const position = Math.abs(arm.rotation.y - angles[0]) <= Math.abs(arm.rotation.y - angles[1]) ? 0 : 1;
	currentPosition = position;
	polarityAnimations.set(targetModel, { position, from: arm.rotation.y, to: angles[position], start: performance.now() });
	if (statusLabel) statusLabel.textContent = position === 0 ? 'Position: Polarity A (+ / -)' : 'Position: Polarity B (- / +)';
	publishPolarity(position);
}

function enableHandleDragging() {
	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	const dragPlane = new THREE.Plane();
	const hitPoint = new THREE.Vector3();
	let dragging = false;
	let dragStartPointerAngle = 0;
	let dragStartArmAngle = 0;

	const updatePointer = event => {
		const rect = renderer.domElement.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(pointer, camera);
	};

	renderer.domElement.addEventListener('pointerdown', event => {
		updatePointer(event);
		if (!raycaster.intersectObject(armGroup, true).length) return;
		dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), armGroup.getWorldPosition(new THREE.Vector3()));
		if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
		const localPoint = mainGroup.worldToLocal(hitPoint.clone());
		dragStartPointerAngle = Math.atan2(localPoint.z, localPoint.x);
		dragStartArmAngle = armGroup.rotation.y;
		dragging = true;
		controls.enabled = false;
		renderer.domElement.setPointerCapture(event.pointerId);
	});
	renderer.domElement.addEventListener('pointermove', event => {
		if (!dragging) return;
		updatePointer(event);
		dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), armGroup.getWorldPosition(new THREE.Vector3()));
		if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
		const localPoint = mainGroup.worldToLocal(hitPoint.clone());
		const pointerAngle = Math.atan2(localPoint.z, localPoint.x);
		const delta = Math.atan2(
			Math.sin(pointerAngle - dragStartPointerAngle),
			Math.cos(pointerAngle - dragStartPointerAngle)
		);
		setPolarityAngle(mainGroup, dragStartArmAngle - delta);
	});
	const stopDragging = event => {
		if (!dragging) return;
		dragging = false;
		controls.enabled = true;
		snapPolarity(mainGroup);
		if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
	};
	renderer.domElement.addEventListener('pointerup', stopDragging);
	renderer.domElement.addEventListener('pointercancel', stopDragging);
}

enableHandleDragging();

function resizeCommutator() {
	const { width, height } = apparatusHost.getBoundingClientRect();
	if (width < 2 || height < 2) return;
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
	renderer.setSize(width, height, false);
}
new ResizeObserver(resizeCommutator).observe(apparatusHost);
window.addEventListener('apparatus:resize', resizeCommutator);

const stage = document.getElementById('commutator-stage');
function animate() {
	requestAnimationFrame(animate);
	if (!stage || !stage.classList.contains('is-active')) return;
	updatePolarityAnimation(mainGroup);
	controls.update();
	renderer.render(scene, camera);
}
animate();

export const getModel = () => mainGroup.clone(true);
