// 获取画布和上下文
const canvas = document.getElementById('tree-canvas');
const ctx = canvas.getContext('2d');
const leftCodeContent = document.getElementById('leftCodeContent');
const rightCodeContent = document.getElementById('rightCodeContent');

// 设置画布大小
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// 树的统计信息
let treeStats = {
    totalBranches: 0,      // 总分支数
    currentDepth: 0,       // 当前深度
    maxDepth: 0,           // 最大深度
    petalCount: 0,         // 花瓣数量
    growthPhase: 'seed'    // 生长阶段
};

/**
 * 树节点类
 */
class TreeNode {
    /**
     * 构造函数
     * @param {number} x - 起点x坐标
     * @param {number} y - 起点y坐标
     * @param {number} length - 枝干长度
     * @param {number} angle - 生长角度
     * @param {number} depth - 节点深度
     * @param {number} scale - 缩放比例
     */
    constructor(x, y, length, angle, depth, scale = 1.3) {
        this.startX = x;
        this.startY = y;
        this.baseLength = length;
        this.length = length * scale;
        this.angle = angle;
        this.depth = depth;
        this.scale = scale;
        this.children = [];
        
        // 更新统计信息
        treeStats.totalBranches++;
        treeStats.maxDepth = Math.max(treeStats.maxDepth, depth);
        
        // 计算终点位置
        this.endX = x + Math.sin(angle) * this.length;
        this.endY = y - Math.cos(angle) * this.length;
        
        // 根据长度确定颜色和宽度
        if (this.baseLength >= 8 && this.baseLength <= 12) {
            this.color = Math.random() < 0.33 ? 'snow' : 'lightcoral';
            this.width = this.length / 3;
            this.hasPetals = Math.random() < 0.3;
        } else if (this.baseLength < 8) {
            this.color = Math.random() < 0.5 ? 'snow' : 'lightcoral';
            this.width = this.length / 2;
            this.hasPetals = Math.random() < 0.5;
        } else {
            this.color = 'sienna';
            this.width = this.length / 10;
            this.hasPetals = false;
        }
    }
    
    /**
     * 递归生长枝干
     */
    grow() {
        if (this.baseLength > 3) {
            const a = 1.5 * Math.random();
            const b = 1.5 * Math.random();
            
            // 右分支
            const rightChild = new TreeNode(
                this.endX, 
                this.endY, 
                this.baseLength - 10 * b, 
                this.angle - (20 * a * Math.PI / 180),
                this.depth + 1,
                this.scale
            );
            rightChild.grow();
            this.children.push(rightChild);
            
            // 左分支
            const leftChild = new TreeNode(
                this.endX, 
                this.endY, 
                this.baseLength - 10 * b, 
                this.angle + (20 * a * Math.PI / 180),
                this.depth + 1,
                this.scale
            );
            leftChild.grow();
            this.children.push(leftChild);
        }
    }
    
    /**
     * 绘制树枝
     * @param {number} progress - 生长进度
     */
    draw(progress) {
        // 计算当前分支的生长因子
        const branchStart = this.depth * 8;
        const branchEnd = branchStart + 8;
        const growthFactor = Math.max(0, Math.min(1, (progress - branchStart) / (branchEnd - branchStart)));
        
        if (growthFactor > 0) {
            treeStats.currentDepth = Math.max(treeStats.currentDepth, this.depth);
            
            ctx.save();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.width;
            ctx.beginPath();
            ctx.moveTo(this.startX, this.startY);
            
            // 根据生长进度绘制部分枝干
            const currentEndX = this.startX + (this.endX - this.startX) * growthFactor;
            const currentEndY = this.startY + (this.endY - this.startY) * growthFactor;
            ctx.lineTo(currentEndX, currentEndY);
            ctx.stroke();
            ctx.restore();
            
            // 绘制子节点
            this.children.forEach(child => child.draw(progress));
        }
    }
    
    /**
     * 获取花瓣位置
     * @returns {Array} 花瓣位置数组
     */
    getPetalPositions() {
        const positions = [];
        if (this.hasPetals && this.baseLength < 12) {
            positions.push({ x: this.endX, y: this.endY });
        }
        this.children.forEach(child => {
            positions.push(...child.getPetalPositions());
        });
        return positions;
    }
}

/**
 * 花瓣类
 */
class Petal {
    /**
     * 构造函数
     * @param {number} x - x坐标
     * @param {number} y - y坐标
     */
    constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 10;
        this.y = y + (Math.random() - 0.5) * 10;
        this.vx = (Math.random() - 0.5) * 1.5;      // x方向速度
        this.vy = Math.random() * 0.5 + 0.5;        // y方向速度
        this.radius = Math.random() * 3 + 2;         // 花瓣半径
        this.opacity = 1;                            // 透明度
        this.angle = Math.random() * Math.PI * 2;   // 旋转角度
        this.angleSpeed = (Math.random() - 0.5) * 0.02;  // 旋转速度
        this.swayPhase = Math.random() * Math.PI * 2;    // 摇摆相位
        treeStats.petalCount++;
    }
    
    /**
     * 更新花瓣状态
     */
    update() {
        // 应用重力
        this.vy += 0.02;
        
        // 应用风效果与摇摆
        this.vx += Math.sin(Date.now() * 0.001 + this.swayPhase) * 0.02;
        
        // 空气阻力
        this.vx *= 0.99;
        this.vy *= 0.99;
        
        // 更新位置
        this.x += this.vx;
        this.y += this.vy;
        
        // 旋转
        this.angle += this.angleSpeed;
        
        // 接近底部时淡出
        if (this.y > canvas.height - 100) {
            this.opacity -= 0.02;
        }
    }
    
    /**
     * 绘制花瓣
     */
    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // 绘制花瓣形状
        ctx.fillStyle = 'lightcoral';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 添加渐变效果
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.3, this.radius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    /**
     * 检查花瓣是否存活
     * @returns {boolean} 是否存活
     */
    isAlive() {
        const alive = this.opacity > 0 && this.y < canvas.height && this.x > -50 && this.x < canvas.width + 50;
        if (!alive) {
            treeStats.petalCount--;
        }
        return alive;
    }
}

/**
 * 生成左侧代码面板内容
 */
function generateLeftCode() {
    const code = `<span class="keyword">function</span> <span class="function">growBranch</span><span class="bracket">(</span><span class="property">length</span>, <span class="property">angle</span>, <span class="property">depth</span><span class="bracket">)</span> <span class="bracket">{</span>
    <span class="keyword">if</span> <span class="bracket">(</span><span class="property">length</span> <span class="operator">></span> <span class="number">3</span><span class="bracket">)</span> <span class="bracket">{</span>
        <span class="function">drawLine</span><span class="bracket">(</span><span class="property">length</span>, <span class="property">angle</span><span class="bracket">)</span>;
        <span class="function">growBranch</span><span class="bracket">(</span>
            <span class="property">length</span> <span class="operator">*</span> <span class="number">0.7</span>, 
            <span class="property">angle</span> <span class="operator">-</span> <span class="number">20°</span>, 
            <span class="property">depth</span> <span class="operator">+</span> <span class="number">1</span>
        <span class="bracket">)</span>;
        <span class="function">growBranch</span><span class="bracket">(</span>
            <span class="property">length</span> <span class="operator">*</span> <span class="number">0.7</span>, 
            <span class="property">angle</span> <span class="operator">+</span> <span class="number">20°</span>, 
            <span class="property">depth</span> <span class="operator">+</span> <span class="number">1</span>
        <span class="bracket">)</span>;
    <span class="bracket">}</span>
<span class="bracket">}</span>

<span class="keyword">const</span> <span class="function">sakuraTree</span> <span class="operator">=</span> <span class="bracket">{</span>
    <span class="property">type</span>: <span class="string">'cherry_blossom'</span>,
    <span class="property">growth</span>: <span class="number">${Math.floor(growthProgress)}%</span>,
    <span class="property">phase</span>: <span class="string">'${treeStats.growthPhase}'</span>,
    
    <span class="property">structure</span>: <span class="bracket">{</span>
        <span class="property">branches</span>: <span class="number">${treeStats.totalBranches}</span>,
        <span class="property">depth</span>: <span class="number">${treeStats.currentDepth}</span> <span class="operator">/</span> <span class="number">${treeStats.maxDepth}</span>,
        <span class="property">petals</span>: <span class="number">${treeStats.petalCount}</span>
    <span class="bracket">}</span>
<span class="bracket">}</span>;`;

    leftCodeContent.innerHTML = code;
}

/**
 * 更新代码面板
 */
function updateCodePanels() {
    generateLeftCode();
}

// 全局变量
let treeRoot = null;          // 树根节点
let petals = [];              // 花瓣数组
let petalPositions = [];      // 花瓣位置数组
let growthProgress = 0;       // 生长进度
let isGrowing = false;        // 是否正在生长
let lastPetalTime = 0;        // 上次生成花瓣的时间
let globalScale = 1.3;        // 全局缩放比例

/**
 * 生成新树
 */
function generateTree() {
    // 重置统计信息
    treeStats = {
        totalBranches: 0,
        currentDepth: 0,
        maxDepth: 0,
        petalCount: 0,
        growthPhase: 'seed'
    };
    
    // 创建树根并递归生长
    treeRoot = new TreeNode(canvas.width / 2, canvas.height - 50, 60, 0, 0, globalScale);
    treeRoot.grow();
    petalPositions = treeRoot.getPetalPositions();
    growthProgress = 0;
    isGrowing = true;
    petals = [];
}

/**
 * 动画循环
 */
function animate() {
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 重置当前深度
    treeStats.currentDepth = 0;
    
    // 绘制树
    if (treeRoot) {
        treeRoot.draw(growthProgress);
    }
    
    // 更新生长阶段
    if (growthProgress < 25) {
        treeStats.growthPhase = 'sprouting';
    } else if (growthProgress < 50) {
        treeStats.growthPhase = 'branching';
    } else if (growthProgress < 75) {
        treeStats.growthPhase = 'blooming';
    } else {
        treeStats.growthPhase = 'flourishing';
    }
    
    // 更新生长进度
    if (isGrowing && growthProgress < 100) {
        growthProgress += 0.5;
        
        // 树生长到一定程度后开始生成花瓣
        if (growthProgress > 40) {
            const now = Date.now();
            if (now - lastPetalTime > 200) {
                lastPetalTime = now;
                const count = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < count; i++) {
                    if (petalPositions.length > 0) {
                        const pos = petalPositions[Math.floor(Math.random() * petalPositions.length)];
                        petals.push(new Petal(pos.x, pos.y));
                    }
                }
            }
        }
    } else if (growthProgress >= 100) {
        isGrowing = false;
        // 完全生长后继续飘落花瓣
        const now = Date.now();
        if (now - lastPetalTime > 500 && petals.length < 150) {
            lastPetalTime = now;
            if (Math.random() < 0.7 && petalPositions.length > 0) {
                const pos = petalPositions[Math.floor(Math.random() * petalPositions.length)];
                petals.push(new Petal(pos.x, pos.y));
            }
        }
    }
    
    // 更新和绘制花瓣
    petals = petals.filter(petal => {
        petal.update();
        petal.draw();
        return petal.isAlive();
    });
    
    // 更新代码面板
    updateCodePanels();
    
    // 继续动画
    requestAnimationFrame(animate);
}

/**
 * 初始化页面6
 */
export function initialize_page6() {
    generateTree();
    animate();
}

// 点击重新生成
canvas.addEventListener('click', () => {
    globalScale = 1.3;
    generateTree();
});

// 窗口大小调整处理
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    generateTree();
});

window.initialize_page6 = initialize_page6;