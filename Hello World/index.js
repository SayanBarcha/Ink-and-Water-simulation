import * as THREE from "https://esm.sh/three@0.156.1";
import GUI from "https://esm.sh/lil-gui";

document.addEventListener("DOMContentLoaded", () => new App());

class App {
	constructor() {
		this.winWidth = window.innerWidth;
		this.winHeight = window.innerHeight;
		this.loadTextures();
	}

	loadTextures() {
		const tl = new THREE.TextureLoader();
		tl.load("https://assets.codepen.io/264161/noise_1.jpg", (texture) => {
			this.noiseTexture = texture;
			this.noiseTexture.wrapS = THREE.RepeatWrapping;
			this.noiseTexture.wrapT = THREE.RepeatWrapping;
			this.setUpScene();
		});
	}

	setUpScene() {
		// Scene
		this.scene = new THREE.Scene();
		this.bgrColor = 0x332e2e;
		this.inkColor = 0x7beeff;
		this.fog = new THREE.Fog(this.bgrColor, 13, 20);
		this.scene.fog = this.fog;
		this.camera = new THREE.PerspectiveCamera(
			60,
			this.winWidth / this.winHeight,
			1,
			100
		);
		this.camera.position.set(0, 7, 8);
		this.camera.lookAt(new THREE.Vector3());
		this.scene.add(this.camera);

		// Hero param
		this.targetHeroUVPos = new THREE.Vector2(0.5, 0.5);
		this.targetHeroAbsMousePos = new THREE.Vector2();
		this.targetHeroRotation = new THREE.Vector2();
		this.heroOldUVPos = new THREE.Vector2(0.5, 0.5);
		this.heroNewUVPos = new THREE.Vector2(0.5, 0.5);
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
		this.mouseDown = false;
		this.thickness = 0.004;
		this.pressure = 0;
		this.persistence = 0.98;
		this.gravity = 0.5;

		// Clock
		this.clock = new THREE.Clock();
		this.time = 0;
		this.deltaTime = 0;

		// Core
		this.createRenderer();
		this.createSim();
		this.createListeners();

		// Environment
		this.floorSize = 30;
		this.createHero();
		this.createFloor();
		this.createLight();
		this.createGUI();

		// Render loop
		this.draw();
	}

	createHero() {
		const geom = new THREE.CylinderGeometry(0.05, 0.2, 1, 16, 1);
		geom.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
		geom.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.5, 0));
		const mat = new THREE.MeshStandardMaterial({
			color: this.inkColor,
			roughness: 1
		});
		this.hero = new THREE.Mesh(geom, mat);
		this.hero.position.y = 0.2;
		this.hero.castShadow = true;
		this.scene.add(this.hero);
	}

	createFloor() {
		const fragmentShader = document.getElementById("floorFragmentShader")
			.textContent;
		const vertexShader = document.getElementById("floorVertexShader").textContent;

		const uniforms = THREE.UniformsUtils.merge([
			THREE.UniformsLib["common"],
			THREE.UniformsLib["shadowmap"],
			THREE.UniformsLib["lights"],
			{
				color: { value: new THREE.Color(this.bgrColor) },
				tScratches: { value: this.bufferSim.output.texture }
			}
		]);
		const geom = new THREE.PlaneGeometry(this.floorSize, this.floorSize);
		const mat = new THREE.ShaderMaterial({
			uniforms,
			fragmentShader,
			vertexShader,
			lights: true
		});
		this.floor = new THREE.Mesh(geom, mat);
		this.floor.rotation.x = -Math.PI / 2;
		this.floor.receiveShadow = true;
		this.scene.add(this.floor);
	}

	createLight() {
		this.ambientLight = new THREE.AmbientLight(0xffffff);
		this.scene.add(this.ambientLight);

		this.light = new THREE.DirectionalLight(0xffffff, 1);
		this.light.position.set(2, 3, 1);
		this.light.castShadow = true;
		this.light.shadow.mapSize.width = 512;
		this.light.shadow.mapSize.height = 512;
		this.light.shadow.camera.near = 0.5;
		this.light.shadow.camera.far = 12;
		this.light.shadow.camera.left = -12;
		this.light.shadow.camera.right = 12;
		this.light.shadow.camera.bottom = -12;
		this.light.shadow.camera.top = 12;
		this.scene.add(this.light);
	}

	createRenderer() {
		const canvas = document.querySelector("canvas.webgl");
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			preserveDrawingBuffer: true
		});
		this.renderer.setClearColor(new THREE.Color(this.bgrColor));

		this.renderer.setPixelRatio((this.pixelRatio = window.devicePixelRatio));
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.toneMapping = THREE.LinearToneMapping;
		this.renderer.toneMappingExposure = 1;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		this.renderer.localClippingEnabled = true;
	}

	createSim() {
		const fragmentShader = document.getElementById("simulationFragmentShader")
			.textContent;
		const vertexShader = document.getElementById("simulationVertexShader")
			.textContent;

		this.floorSimMat = new THREE.ShaderMaterial({
			uniforms: {
				inputTexture: { type: "t", value: null },
				noiseTexture: { type: "t", value: this.noiseTexture },
				persistence: { value: this.persistence },
				thickness: { value: this.thickness },
				waterDiffusion: { value: 0.1 },
				waterQuantity: { value: 0.3 },
				gravity: { value: this.gravity },
				time: { value: 0 },
				tipPosOld: { value: new THREE.Vector2(0.5, 0.5) },
				tipPosNew: { value: new THREE.Vector2(0.5, 0.5) },
				speed: { value: 0.0 },
				inkColor: { value: new THREE.Color(this.inkColor) }
			},
			vertexShader,
			fragmentShader
		});
		this.bufferSim = new BufferSim(this.renderer, 1024, 1024, this.floorSimMat);
	}

	createListeners() {
		window.addEventListener("resize", this.onWindowResize.bind(this));
		document.addEventListener("mousemove", this.onMouseMove.bind(this), false);
		document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
		document.addEventListener("mouseup", this.onMouseUp.bind(this), false);
		document.addEventListener("touchmove", this.onTouchMove.bind(this), false);
	}

	draw() {
		this.updateGame();
		this.renderer.render(this.scene, this.camera);
		if (this.controls) this.controls.update();
		window.requestAnimationFrame(this.draw.bind(this));
	}

	updateGame() {
		this.dt = this.clock.getDelta();
		this.time += this.dt;

		this.heroNewUVPos.lerp(this.targetHeroUVPos, this.dt * 5);
		this.hero.position.x = (this.heroNewUVPos.x - 0.5) * this.floorSize;
		this.hero.position.z = (0.5 - this.heroNewUVPos.y) * this.floorSize;

		this.heroSpeed = new THREE.Vector2().subVectors(
			this.heroNewUVPos,
			this.heroOldUVPos
		);
		this.targetHeroRotation.lerp(
			this.heroSpeed.clone().multiplyScalar(90),
			this.dt * 30
		);

		this.hero.rotation.z = this.targetHeroRotation.x;
		this.hero.rotation.x = this.targetHeroRotation.y;

		this.floorSimMat.time += this.dt;
		this.floorSimMat.uniforms.tipPosNew.value = this.heroNewUVPos;
		this.floorSimMat.uniforms.tipPosOld.value = this.heroOldUVPos;
		this.floorSimMat.uniforms.speed.value = this.heroSpeed.length();
		const r = Math.abs(Math.sin(this.time * 0.61 + 0.0));
		const g = Math.abs(Math.sin(this.time * 0.43 + 2.09));
		const b = Math.abs(Math.sin(this.time * 0.36 + 4.18));
		const newCol = new THREE.Color(r, g, b);
		this.floorSimMat.uniforms.inkColor.value = newCol;
		this.floorSimMat.uniforms.time.value = this.time;
		this.floorSimMat.uniforms.persistence.value = Math.pow(
			this.persistence,
			this.dt * 10
		);
		this.floorSimMat.uniforms.gravity.value = this.gravity * this.dt;

		if (this.mouseDown && this.pressure < 0.02) {
			this.pressure += this.dt * 0.02;
		} else if (!this.mouseDown) {
			this.pressure *= Math.pow(0.9, this.dt * 30);
		}
		this.floorSimMat.uniforms.thickness.value = this.thickness + this.pressure;

		this.hero.scale.y = 1 - this.pressure * 10;
		this.hero.scale.x = 1 + this.pressure * 40;
		this.hero.scale.z = 1 + this.pressure * 40;
		this.bufferSim.render();
		this.renderer.setRenderTarget(null);

		this.floor.material.uniforms.tScratches.value = this.bufferSim.output.texture;
		this.hero.material.color = newCol;
		this.heroOldUVPos = this.heroNewUVPos.clone();
	}

	onWindowResize() {
		this.winWidth = window.innerWidth;
		this.winHeight = window.innerHeight;
		this.camera.aspect = this.winWidth / this.winHeight;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(this.winWidth, this.winHeight);
	}

	onMouseDown(event) {
		this.mouseDown = true;
	}

	onMouseUp(event) {
		this.mouseDown = false;
	}

	onMouseMove(event) {
		const x = (event.clientX / this.winWidth) * 2 - 1;
		const y = -((event.clientY / this.winHeight) * 2 - 1);
		this.mouse.x = x;
		this.mouse.y = y;
		if (this.floor) this.raycast();
	}

	onTouchMove(event) {
		if (event.touches.length == 1) {
			event.preventDefault();
			const x = (event.touches[0].pageX / this.winWidth) * 2 - 1;
			const y = -((event.touches[0].pageY / this.winHeight) * 2 - 1);
			this.mouse.x = x;
			this.mouse.y = y;
			if (this.floor) this.raycast();
		}
	}

	raycast() {
		this.raycaster.setFromCamera(this.mouse, this.camera);
		var intersects = this.raycaster.intersectObjects([this.floor]);

		if (intersects.length > 0) {
			this.targetHeroUVPos.x = intersects[0].uv.x;
			this.targetHeroUVPos.y = intersects[0].uv.y;
		}
	}

	createGUI() {
		const fsu = this.floorSimMat.uniforms;
		this.gui = new GUI();
		this.gui.add(this, "persistence", 0.8, 0.999).name("Persistence");
		this.gui.add(this, "thickness", 0.0003, 0.02).name("Thickness");
		this.gui.add(fsu.waterQuantity, "value", 0.0, 1).name("water quantity");
		this.gui.add(fsu.waterDiffusion, "value", 0.01, 1).name("water diffusion");
		this.gui.add(this, "gravity", 0, 1).name("gravity");
		//this.gui.close();
	}
}
class BufferSim {
	constructor(renderer, width, height, shader) {
		this.renderer = renderer;
		this.shader = shader;
		this.orthoScene = new THREE.Scene();
		var fbo = new THREE.WebGLRenderTarget(width, height, {
			wrapS: THREE.ClampToEdgeWrapping,
			wrapT: THREE.ClampToEdgeWrapping,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});

		fbo.texture.generateMipmaps = false;

		this.fbos = [fbo, fbo.clone()];
		this.current = 0;
		this.output = this.fbos[0];
		this.orthoCamera = new THREE.OrthographicCamera(
			width / -2,
			width / 2,
			height / 2,
			height / -2,
			0.00001,
			1000
		);
		this.orthoQuad = new THREE.Mesh(
			new THREE.PlaneGeometry(width, height),
			this.shader
		);
		this.orthoScene.add(this.orthoQuad);
	}

	render() {
		this.shader.uniforms.inputTexture.value = this.fbos[this.current].texture;
		this.input = this.fbos[this.current];
		this.current = 1 - this.current;
		this.output = this.fbos[this.current];
		this.renderer.setRenderTarget(this.output);
		this.renderer.render(this.orthoScene, this.orthoCamera);
		this.renderer.setRenderTarget(null);
	}
}
