/**
 * 页面7模块
 */
const Page7Module = (function() {
    // 私有变量
    let scene, camera, renderer;
    let cards = [];                    // 卡片数组
    let cardsGroup;                    // 卡片组
    let raycaster, mouse;              // 光线投射器和鼠标位置
    let selectedCard = null;           // 已选中的卡片
    let hoveredCard = null;            // 悬停的卡片
    let currentPreviewCard = null;     // 当前预览的卡片

    // 状态标志
    let isAnimating = false;           // 是否正在动画
    let isInFullscreenMode = false;    // 是否处于全屏模式

    // 卡片配置
    const TOTAL_CARDS = 15;            // 卡片总数
    const CARD_WIDTH = 3.2;            // 卡片宽度
    const CARD_HEIGHT = 1.8;           // 卡片高度
    const CARD_DEPTH = 0.01;           // 卡片厚度
    const CARD_SPACING = 0.6;          // 卡片间距

    // 纹理尺寸设置 - 根据卡片比例计算最佳纹理尺寸
    const TEXTURE_WIDTH = 1024;        // 提高纹理分辨率
    const TEXTURE_HEIGHT = Math.round(TEXTURE_WIDTH * (CARD_HEIGHT / CARD_WIDTH));

    // 卡片数据
    const cardData = [
        {
            title: "OhMyKing's Space",
            subtitle: 'Geometry. Grid. Movement.',
            description: "A digital space where International Style meets Constructivism. Built with clean HTML/CSS/JavaScript, enhanced by Three.js for spatial experiences and GSAP for fluid motion.",
            image: "./src/imgs/card1.png",
            date: '2025-06-28'
        }
    ];

    /**
     * 图片预处理函数
     * @param {string} imageSrc - 图片源地址
     * @param {number} targetWidth - 目标宽度
     * @param {number} targetHeight - 目标高度
     * @returns {Promise} 处理后的纹理
     */
    function preprocessImage(imageSrc, targetWidth, targetHeight) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = function() {
                // 创建canvas进行图片预处理
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                
                // 计算缩放以保持宽高比并填充整个目标区域
                const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                
                // 居中裁剪
                const offsetX = (targetWidth - scaledWidth) / 2;
                const offsetY = (targetHeight - scaledHeight) / 2;
                
                // 启用高质量图像缩放
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                // 绘制图片
                ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
                
                // 创建纹理
                const texture = new THREE.CanvasTexture(canvas);
                texture.needsUpdate = true;
                
                // 高质量纹理设置
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // 最大各向异性过滤
                
                resolve(texture);
            };
            
            img.onerror = function() {
                reject(new Error('Failed to load image: ' + imageSrc));
            };
            
            img.src = imageSrc;
        });
    }

    /**
     * 初始化场景
     * @param {string} containerId - 容器ID
     */
    function init(containerId = 'canvas-wrapper') {
        scene = new THREE.Scene();
        scene.background = null;
        
        // 设置相机
        camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 1000);
        camera.position.set(-1, -1, 15);
        
        // 优化渲染器设置
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            precision: 'highp',                      // 高精度渲染
            powerPreference: 'high-performance',     // 高性能模式
            alpha: true,
        });

        renderer.setClearAlpha(0)
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);     // 使用设备像素比
        renderer.outputEncoding = THREE.SRGBColorSpace;      // 正确的颜色空间
        
        const container = document.getElementById(containerId);
        if (container) {
            container.appendChild(renderer.domElement);
        }
        
        // 设置光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 7);
        scene.add(directionalLight);
        
        // 初始化光线投射器
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        
        // 创建卡片
        createCards();
        
        // 添加事件监听
        window.addEventListener('resize', onWindowResize);
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        renderer.domElement.addEventListener('mouseleave', onMouseLeave);
        
        // 开始动画循环
        animate();
    }

    /**
     * 创建3D卡片
     */
    async function createCards() {
        const colors = [
            0xd73a49, 0xd73a49, 0xd73a49, 0xd73a49, 0xd73a49,
            0xd73a49, 0xd73a49, 0xd73a49, 0xd73a49, 0xd73a49,
            0xd73a49, 0xd73a49, 0xd73a49, 0xd73a49, 0xd73a49,
        ];
        
        const commonRotationY = Math.PI * 0.05;
        const commonRotationX = Math.PI * -0.02;
        
        // 创建卡片组
        cardsGroup = new THREE.Group();
        scene.add(cardsGroup);
        
        // 设置卡片组的位置和旋转
        cardsGroup.position.set(-3.8, 0, 0.1);
        cardsGroup.rotation.y = Math.PI * 0.22;
        cardsGroup.rotation.x = Math.PI * 0.09;
        cardsGroup.scale.set(0.85, 0.85, 0.85);
        
        // 存储卡片组的位置信息
        cardsGroup.userData = {
            centerX: -3.8,
            leftX: -7  // 调整为适应新布局
        };
        
        let loadedTextures = 0;
        const totalTextures = TOTAL_CARDS;
        
        // 创建每张卡片
        for (let i = 0; i < TOTAL_CARDS; i++) {
            const geometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH);
            
            const dataIndex = (TOTAL_CARDS - 1 - i) % cardData.length;
            const currentCardData = cardData[dataIndex];
            
            // 创建临时材质
            const tempFrontMaterial = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
            const backMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xdddddd });
            
            const materials = [
                edgeMaterial,        // 右侧
                edgeMaterial,        // 左侧
                edgeMaterial,        // 顶部
                edgeMaterial,        // 底部
                tempFrontMaterial,   // 正面 (临时颜色)
                backMaterial         // 背面
            ];
            
            const card = new THREE.Mesh(geometry, materials);
            
            // 设置卡片位置
            const zOffset = i * CARD_SPACING;
            const xOffset = i * 0.02;
            
            card.position.set(xOffset, -10, zOffset);
            card.rotation.set(commonRotationX, commonRotationY, 0);
            
            // 存储卡片数据
            card.userData = {
                index: TOTAL_CARDS - 1 - i,
                origX: xOffset,
                origY: 0,
                origZ: zOffset,
                zIndex: i,
                data: currentCardData
            };
            
            cardsGroup.add(card);
            cards.push(card);
            
            // 异步加载和预处理纹理
            preprocessImage(currentCardData.image, TEXTURE_WIDTH, TEXTURE_HEIGHT)
                .then(texture => {
                    const frontMaterial = new THREE.MeshBasicMaterial({ 
                        map: texture,
                        side: THREE.FrontSide
                    });
                    card.material[4] = frontMaterial;
                    
                    loadedTextures++;
                    if (loadedTextures === totalTextures) {
                        // 所有纹理加载完成，隐藏加载指示器
                        const loadingIndicator = document.querySelector('.loading-indicator');
                        if (loadingIndicator) {
                            loadingIndicator.style.display = 'none';
                        }
                    }
                })
                .catch(error => {
                    console.error('Error loading texture:', currentCardData.image, error);
                    loadedTextures++;
                    if (loadedTextures === totalTextures) {
                        const loadingIndicator = document.querySelector('.loading-indicator');
                        if (loadingIndicator) {
                            loadingIndicator.style.display = 'none';
                        }
                    }
                });
        }
        
        // 开始入场动画
        animateCardsEntry();
    }

    /**
     * 显示预览
     * @param {THREE.Mesh} card - 要预览的卡片
     */
    function showPreview(card) {
        if (currentPreviewCard === card) return;
        
        currentPreviewCard = card;
        const data = card.userData.data;
        const index = card.userData.index + 1;
        
        const previewContent = document.querySelector('.preview-content');
        const previewContainer = document.querySelector('.preview-container');
        const previewBorder = document.querySelector('.preview-border');
        const placeholder = document.querySelector('.preview-placeholder');
        
        // 移动卡片组到左侧
        gsap.to(cardsGroup.position, {
            x: cardsGroup.userData.leftX,
            duration: 0.5,
            ease: "power2.inOut"
        });
        
        // 激活预览容器和边框
        if (previewContainer) previewContainer.classList.add('active');
        if (previewBorder) previewBorder.classList.add('active');
        
        // 更新预览内容
        const previewImage = document.querySelector('.preview-image img');
        const previewDate = document.querySelector('.preview-date'); 
        const previewTitle = document.querySelector('.preview-title');
        const previewSubtitle = document.querySelector('.preview-subtitle'); 
        const previewDescription = document.querySelector('.preview-description');
        
        if (previewImage) previewImage.src = data.image;
        if (previewDate) previewDate.textContent = data.date; 
        if (previewTitle) previewTitle.textContent = data.title;
        if (previewSubtitle) previewSubtitle.textContent = data.subtitle; 
        if (previewDescription) previewDescription.textContent = data.description;
        
        if (placeholder) placeholder.style.display = 'none';
        if (previewContent) previewContent.classList.add('active');
    }

    /**
     * 隐藏预览
     */
    function hidePreview() {
        currentPreviewCard = null;
        const previewContent = document.querySelector('.preview-content');
        const previewContainer = document.querySelector('.preview-container');
        const previewBorder = document.querySelector('.preview-border');
        const placeholder = document.querySelector('.preview-placeholder');
        
        // 移动卡片组回到中心
        gsap.to(cardsGroup.position, {
            x: cardsGroup.userData.centerX,
            duration: 0.5,
            ease: "power2.inOut"
        });
        
        // 隐藏预览容器和边框
        if (previewContainer) previewContainer.classList.remove('active');
        if (previewBorder) previewBorder.classList.remove('active');
        
        if (previewContent) previewContent.classList.remove('active');
        setTimeout(() => {
            if (placeholder) placeholder.style.display = 'block';
        }, 300);
    }

    /**
     * 从预览打开卡片
     */
    function openCard() {
        if (currentPreviewCard && !isAnimating && !isInFullscreenMode) {
            selectedCard = currentPreviewCard;
            
            const previewContainer = document.querySelector('.preview-container');
            const previewBorder = document.querySelector('.preview-border');
            
            if (previewContainer) previewContainer.classList.remove('active');
            if (previewBorder) previewBorder.classList.remove('active');
            
            // 移动卡片组回到中心
            gsap.to(cardsGroup.position, {
                x: cardsGroup.userData.centerX,
                duration: 0.5,
                ease: "power2.inOut"
            });
            
            // 执行退出和全屏动画
            animateCardsExit(currentPreviewCard, function() {
                animateCardFullscreen(currentPreviewCard);
            });
        }
    }

    /**
     * 窗口大小调整处理
     */
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
    }

    /**
     * 鼠标移动处理
     * @param {MouseEvent} event - 鼠标事件
     */
    function onMouseMove(event) {
        if (isAnimating || isInFullscreenMode) {
            document.body.style.cursor = 'default';
            return;
        }
        
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(cards);
        
        // 重置所有卡片状态
        cards.forEach(card => {
            if (card !== selectedCard) {
                gsap.to(card.position, {
                    y: card.userData.origY,
                    duration: 0.5,
                    overwrite: true
                });
                
                gsap.to(card.scale, {
                    x: 1,
                    y: 1,
                    z: 1,
                    duration: 0.3,
                    overwrite: true
                });
            }
        });
        
        // 处理悬停效果
        if (intersects.length > 0) {
            const newHoveredCard = intersects[0].object;
            hoveredCard = newHoveredCard;
            
            // 悬停卡片抬起
            gsap.to(hoveredCard.position, {
                y: hoveredCard.userData.origY + 0.8,
                duration: 0.4,
                overwrite: true
            });
            
            // 悬停卡片放大
            gsap.to(hoveredCard.scale, {
                x: 1.05,
                y: 1.05,
                z: 1.05,
                duration: 0.3,
                overwrite: true
            });
            
            showPreview(hoveredCard);
            document.body.style.cursor = 'pointer';
        } else {
            if (hoveredCard) {
                hidePreview();
            }
            hoveredCard = null;
            document.body.style.cursor = 'default';
        }
    }

    /**
     * 鼠标离开处理
     */
    function onMouseLeave() {
        if (!isAnimating && !isInFullscreenMode && hoveredCard) {
            hidePreview();
            hoveredCard = null;
            
            // 重置所有卡片状态
            cards.forEach(card => {
                gsap.to(card.position, {
                    y: card.userData.origY,
                    duration: 0.5,
                    overwrite: true
                });
                
                gsap.to(card.scale, {
                    x: 1,
                    y: 1,
                    z: 1,
                    duration: 0.3,
                    overwrite: true
                });
            });
        }
    }

    /**
     * 卡片入场动画
     */
    function animateCardsEntry() {
        isAnimating = true;
        
        // 初始化卡片位置
        cards.forEach((card) => {
            card.position.y = -10;
        });
        
        const totalAnimationDuration = cards.length * 0.1 + 1.8;
        
        // 逐个卡片入场
        cards.forEach((card, index) => {
            gsap.to(card.position, {
                y: card.userData.origY,
                duration: 1.8,
                delay: index * 0.1,
                ease: "elastic.out(1, 0.5)",
                bezier: {
                    type: "soft",
                    values: [
                        {x: card.position.x, y: -8, z: card.position.z},
                        {x: card.position.x + 0.3, y: -6, z: card.position.z},
                        {x: card.position.x - 0.2, y: -4, z: card.position.z},
                        {x: card.position.x, y: card.userData.origY, z: card.position.z}
                    ],
                    autoRotate: false
                }
            });
            
            gsap.to(card.scale, {
                x: 1,
                y: 1,
                z: 1,
                duration: 0.3
            });
        });
        
        selectedCard = null;
        
        // 动画完成后重置状态
        setTimeout(() => {
            isAnimating = false;
        }, totalAnimationDuration * 1000);
    }

    /**
     * 卡片退出动画
     * @param {THREE.Mesh} excludeCard - 排除的卡片
     * @param {Function} onAllExited - 所有卡片退出后的回调
     */
    function animateCardsExit(excludeCard, onAllExited) {
        isAnimating = true;
        
        let animatingCards = 0;
        let completedAnimations = 0;
        
        // 计算需要动画的卡片数
        cards.forEach((card) => {
            if (card !== excludeCard) {
                animatingCards++;
            }
        });
        
        if (animatingCards === 0 && onAllExited) {
            onAllExited();
            return;
        }
        
        // 执行退出动画
        cards.forEach((card) => {
            if (card !== excludeCard) {
                gsap.to(card.position, {
                    y: -10,
                    duration: 1.5,
                    delay: (TOTAL_CARDS - card.userData.zIndex) * 0.08,
                    ease: "power2.in",
                    bezier: {
                        type: "soft",
                        values: [
                            {x: card.position.x, y: card.position.y, z: card.position.z},
                            {x: card.position.x - 0.2, y: -4, z: card.position.z},
                            {x: card.position.x + 0.3, y: -6, z: card.position.z},
                            {x: card.position.x, y: -10, z: card.position.z}
                        ],
                        autoRotate: false
                    },
                    onComplete: function() {
                        completedAnimations++;
                        if (completedAnimations === animatingCards) {
                            isAnimating = false;
                            if (onAllExited) onAllExited();
                        }
                    }
                });
                
                gsap.to(card.scale, {
                    x: 1,
                    y: 1,
                    z: 1,
                    duration: 0.3
                });
            }
        });
    }

    /**
     * 动画循环
     */
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    /**
     * 清理函数
     */
    function cleanup() {
        if (renderer) {
            // 移除事件监听
            renderer.domElement.removeEventListener('mousemove', onMouseMove);
            renderer.domElement.removeEventListener('mouseleave', onMouseLeave);
            window.removeEventListener('resize', onWindowResize);
            
            // 移除渲染器DOM元素
            if (renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
            
            // 销毁渲染器
            renderer.dispose();
        }
        
        // 清空数组
        cards = [];
        
        // 重置状态
        selectedCard = null;
        hoveredCard = null;
        currentPreviewCard = null;
        isAnimating = false;
        isInFullscreenMode = false;
    }

    // 公共API
    return {
        init: init,
        cleanup: cleanup,
        openCard: openCard,
    };
})();

if (typeof window !== 'undefined') {
    // 暴露到全局以保持兼容性
    window.Page7Module = Page7Module;
    
    // 如果需要保持原有的全局函数
    window.openCard = Page7Module.openCard;
}