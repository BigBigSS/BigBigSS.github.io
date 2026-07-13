/**
 * 生成等差数列
 * @param {number} a - 起始值
 * @param {number} b - 结束值
 * @param {number} number - 数列长度
 * @returns {Array} 等差数列
 */
function arange(a, b, number = 3) {
    let step = (b - a) / number;
    let result = [a];
    for (let i = 0; i < number - 1; i++) {
        result.push(result[result.length - 1] + step);
    }
    result.push(b);
    return result;
}

/**
 * 延迟执行函数
 * @param {Function} callback - 回调函数
 * @param {number} timeout - 延迟时间
 * @returns {Promise} Promise对象
 */
function wait(callback, timeout) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            callback();
            resolve();
        }, timeout);
    });
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} timeout - 防抖延迟时间
 * @returns {Function} 防抖后的函数
 */
function debounce(func, timeout = 100) {
    let timer = 0;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func(...args); }, timeout);
    };
}

// 黄金比例常数
const PHI = (Math.sqrt(5) + 1) / 2;

/**
 * 黄金螺旋类
 */
class GoldenSpiral {
    /**
     * 构造函数
     * @param {Object} params - 参数对象
     * @param {Object} params.position - 中心位置
     * @param {CanvasRenderingContext2D} params.ctx - 绘图上下文
     * @param {number} params.size - 初始尺寸
     * @param {string} params.color - 螺旋颜色
     * @param {string} params.borderColor - 边框颜色
     * @param {AbortSignal} params.signal - 中止信号
     */
    constructor({ position, ctx, size = 280, color, borderColor, signal }) {
        this.ctx = ctx;
        this.position = position;
        this.radius = size;
        this.step = this.radius;
        this.angle = [Math.PI, Math.PI / 2];
        this.direction = { x: -1, y: 0 };
        this.color = color;
        this.borderColor = borderColor;
        this.signal = signal;
    }

    /**
     * 渲染螺旋段
     */
    async render() {
        if (this.signal.aborted) {
            return;
        }

        // 插值生成平滑曲线
        const interpolation = arange(this.angle[0], this.angle[1], this.radius * 0.10);
        for (let i = 0; i < interpolation.length - 1; i++) {
            await this.arc(interpolation[i], interpolation[i + 1]);
        }
        
        // 绘制边框
        const size = interpolation.length;
        this.ctx.strokeStyle = this.borderColor;
        this.ctx.arc(this.position.x, this.position.y, 0, interpolation[size - 2], interpolation[size - 1], true);
        this.ctx.stroke();
    }

    /**
     * 更新螺旋参数
     */
    update() {
        // 更新角度
        if (this.angle[1] < 0)
            this.angle[1] = Math.PI * 1.5;
        this.angle[0] = this.angle[1];
        this.angle[1] = this.angle[0] - Math.PI / 2;

        // 更新半径
        let temp = this.radius;
        this.radius = (PHI - 1) * this.radius;
        this.step = temp - this.radius;

        // 更新中心位置
        this.direction = { x: this.direction.y, y: -this.direction.x };
        this.position.x += this.direction.x * this.step;
        this.position.y += this.direction.y * this.step;
    }

    /**
     * 绘制圆弧
     * @param {number} startAngle - 起始角度
     * @param {number} endAngle - 结束角度
     */
    async arc(startAngle, endAngle) {
        if (this.signal.aborted) {
            return;
        }
        await wait(() => {
            this.ctx.beginPath();
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = this.color;
            this.ctx.arc(this.position.x, this.position.y, this.radius, startAngle, endAngle, true);
            this.ctx.stroke();
        }, 500 / 60);
    }

    /**
     * 执行动画步骤
     */
    async animate() {
        if (this.signal.aborted) {
            return;
        }
        await this.render();
        this.update();
    }
}

/**
 * 画板绘制类
 */
class GoldenSpiralCanvas {
    /**
     * 构造函数
     * @param {Object} params - 参数对象
     * @param {string} params.background - 背景颜色
     * @param {string} params.color - 螺旋颜色
     * @param {string} params.borderColor - 边框颜色
     */
    constructor({ background = 'white', color = 'black', borderColor = '#ffffff' }) {
        this.color = color;
        this.bgColor = background;
        this.borderColor = borderColor;

        this.canvas = document.querySelector('#spiral-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.globalCompositeOperation = "darken";

        this.pixelRatio = window.devicePixelRatio > 1 ? 2 : 1;

        this.resize = this.resize.bind(this);
        this.animate = this.animate.bind(this);

        // 窗口大小调整事件处理
        window.addEventListener('resize', debounce(async () => {
            await this.clear();
            this.resize();
            await this.start();
        }));
        
        this.resize();
    }

    /**
     * 调整画布大小
     */
    resize() {
        let domWidth = window.innerWidth;
        let domHeight = window.innerHeight * 0.9;
        let ratio = domWidth / domHeight;

        // 响应式设计
        this.stageWidth = domWidth;
        this.stageHeight = (ratio >= 1.6) ? domHeight : Math.floor(domWidth / 1.618);

        this.width = this.stageWidth * this.pixelRatio;
        this.height = this.stageHeight * this.pixelRatio;

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        Object.assign(this.canvas.style, {
            width: `${this.stageWidth}px`,
            height: `${this.stageHeight}px`,
        });

        this.ctx.scale(this.pixelRatio, this.pixelRatio);
    }

    /**
     * 执行动画
     */
    async animate() {
        // 绘制20个螺旋段
        for (let i = 0; i < 20; i++) {
            await this.spiral.animate();
        }
    }

    /**
     * 清空画布
     */
    async clear() {
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.width, this.height);
        await wait(() => {}, 700);
    }

    /**
     * 开始动画
     */
    async start() {
        let radius = this.stageHeight - 10;

        this.abortController = new AbortController();
        this.spiral = new GoldenSpiral({
            position: { x: radius, y: 0 },
            ctx: this.ctx,
            size: radius,
            color: this.color,
            borderColor: this.borderColor,
            signal: this.abortController.signal
        });

        await this.clear();
        await this.animate();
    }
}

// 初始化参数
const options = {
    color: '#000000',
    background: "rgba(0,0,0,0)",
    borderColor: '#000000',
};

// 创建应用实例
const golden_spiral_canvas = new GoldenSpiralCanvas(options);

/**
 * 初始化页面5
 */
export function initialize_page5() {
    golden_spiral_canvas.start();
}
window.initialize_page5 = initialize_page5;