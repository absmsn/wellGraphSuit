window.addEventListener("load", function () {
  // 加载数据并绘图
  init();
  // 添加事件监听器
  // 选择不同的图
  var selects = document.getElementsByName("typeSel");
  for (var i = 0; i < selects.length; i++) {
    var ele = selects[i];
    ele.addEventListener("change", function () {
      curGraph && curGraph.hide();
      var candidate;
      if (this.value === "spatial") {
        candidate = spatialTrack;
      } else if (this.value === "verticalEW") {
        candidate = verticalProjectionEW;
      } else if (this.value === "verticalNS") {
        candidate = verticalProjectionNS;
      } else if (this.value === "horizontal") {
        candidate = horizontalProjection;
      }
      if (candidate) {
        curGraph = candidate;
        curGraph.show();
      }
    });
  }
  var resetBtn = document.getElementById("reset-btn");
  resetBtn && resetBtn.addEventListener("click", function () {
    if (curGraph) {
      curGraph.reset();
    }
  });
  var exportBtn = document.getElementById("export-btn");
  exportBtn && exportBtn.addEventListener("click", function () {
    if (curGraph) {
      curGraph.export();
    }
  });
});

// 公共变量
var kop; // 造斜点的深度
var vViewAngle = 45; // 摄像机垂直方向的视野角度
var geometry, configObj;
// xy坐标平面大小
// x,y坐标中绝对值最大的数
var xyFarthest, xs, ys, depths;
var curGraph; // 当前页面显示的图像
var spatialTrack, verticalProjectionEW, horizontalProjection, verticalProjectionNS;
var fontPath = './font/optimer_regular.typeface.json';
var configPath = './config.json';
var baseColor = "#000000";
var factorArray = [10000, 1000, 100, 10, 1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001];
var trackPoints = [{
  dxpy: 25.64,
  nbpy: 32.05,
  cs: 105,
  zxd: 200
}, {
  dxpy: -47,
  nbpy: 37,
  cs: 115
}, {
  dxpy: 22,
  nbpy: 66,
  cs: 266
},{
  dxpy: 77,
  nbpy: 72,
  cs: 605
}];
var targetPoints = [{
  yzb: 44,
  jkhzby: 0,
  xzb: 70,
  jkzzbx: 0,
  csb: 400,
  ybbqbj: 50
}];
var material = new THREE.LineBasicMaterial({color: baseColor});

// 使用FontLoader加载的字体,接受一个回调函数
// 回调函数的参数是字体对象
var useFont = (function () {
  var timerId = null;
  var loadedFont = null;
  var waitingTasks = [];
  var loader = new THREE.FontLoader();
  loader.load(fontPath, function (font) {
    loadedFont = font;
  });
  return function (callback) {
    if (loadedFont) {
      callback(loadedFont);
    } else {
      waitingTasks.push(callback);
      // 定时检查字体是否已经加载
      if (!timerId) {
        timerId = setInterval(function () {
          if (loadedFont) {
            waitingTasks.forEach(function (cb) {
              cb(loadedFont);
            });
            waitingTasks.splice(0, waitingTasks.length);
            clearInterval(timerId);
          }
        }, 10);
      }
    }
  }
})();

function initSpatialTrack() {
  var autoRotate = true;
  var xyGridNum = 10, zGridNum = 10, maxZToXyRatio = 2, fontSizeToUnitRatio = .3, xyUnit, zUnit;
  var xAxisColor = "#ff0000", yAxisColor = "#00ff00", zAxisColor = "#0000ff", verticalLineColor = "#35a066";
  var fontColor = baseColor, trackLineColor = baseColor, projectionLineColor = baseColor;
  // 设置从配置文件中自定义的一些参数
  if (configObj && configObj.spatialTrack) {
    var config = configObj.spatialTrack;
    xyGridNum = config.xyGridNum || xyGridNum;
    zGridNum = config.zGridNum || zGridNum;
    xAxisColor = config.xAxisColor || xAxisColor;
    yAxisColor = config.yAxisColor || yAxisColor;
    zAxisColor = config.zAxisColor || zAxisColor;
    fontColor = config.fontColor || fontColor;
    maxZToXyRatio = config.maxZToXyRatio || maxZToXyRatio;
    verticalLineColor = config.verticalLineColor || verticalLineColor;
    trackLineColor = config.trackLineColor || trackLineColor;
    projectionLineColor = config.projectionLineColor || projectionLineColor;
    fontSizeToUnitRatio = config.fontSizeToUnitRatio || fontSizeToUnitRatio;
    if (typeof config.autoRotate === "boolean") {
      autoRotate = config.autoRotate;
    }
  }
  var xAxisMaterial = new THREE.LineBasicMaterial({color: xAxisColor, side: THREE.DoubleSide});
  var yAxisMaterial = new THREE.LineBasicMaterial({color: yAxisColor, side: THREE.DoubleSide});
  var zAxisMaterial = new THREE.LineBasicMaterial({color: zAxisColor, side: THREE.DoubleSide});
  var trackLineMaterial = new THREE.LineBasicMaterial({color: trackLineColor, side: THREE.DoubleSide});
  var projectionLineMaterial = new THREE.LineBasicMaterial({color: projectionLineColor, side: THREE.DoubleSide});
  var maxDepth = Math.max.apply(null, depths); // 最大深度

  var _xyFarthest = xyFarthest;
  if (maxDepth / xyFarthest > maxZToXyRatio) {
    _xyFarthest = maxDepth / maxZToXyRatio;
  }

  // 获取一个合适的网格大小,xoy平面
  xyUnit = getApproximateGridSize(_xyFarthest, xyGridNum, factorArray);
  _xyFarthest = fMul(xyGridNum, xyUnit);
  zUnit = getApproximateGridSize(maxDepth, zGridNum, factorArray);
  maxDepth = fMul(zGridNum, zUnit);

  // 将深度转换为z轴上的坐标
  var depthToZ = function (depth) { return fSub(maxDepth, depth) };
  // 将z轴上的坐标转换为深度
  var zToDepth = function (z) { return fSub(maxDepth, z) };
  var zs = depths.map(function (d) { return depthToZ(d) });
  var xRange = {min: -_xyFarthest, max: _xyFarthest}; // x坐标轴的范围
  var yRange = {min: -_xyFarthest, max: _xyFarthest}; // y坐标轴的范围
  var zRange = { // z坐标轴的范围
    min: depthToZ(maxDepth),
    max: depthToZ(0) // 深度0在z轴的最上方
  }
  var smallestDashNum = 10; // 在最短的垂线(虚线)上显示的虚线段的数目
  var gapRatio = 1 / 3; // 间隙占虚线端的比例
  var altitudeZ = maxDepth - Math.max.apply(null, depths); // 深度最大的点距离xoy平面的垂直距离
  var verticalLineMaterial = new THREE.LineDashedMaterial({
    color: verticalLineColor,
    dashSize: (altitudeZ / smallestDashNum) * (1 - gapRatio),
    gapSize: (altitudeZ / smallestDashNum) * gapRatio,
  });
  var arrowWidth = xyUnit / 2, arrowHeight = xyUnit; // 坐标轴箭头的底部宽度和高度,以箭头向上指为准,箭头为平面箭头
  var canvas = document.getElementById("spatialTrack");
  // 暂时先让画布显示,因为需要知道画布的宽高
  canvas.style.display = "";
  // 渲染器
  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: canvas,
    preserveDrawingBuffer: true // 设置为true才能导出图片
  });
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  renderer.setClearColor(new THREE.Color("white"));
  // 场景
  var scene = new THREE.Scene();
  // 相机
  var camera = new THREE.PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 1, 100000);
  // var camera = new THREE.OrthographicCamera(canvas.offsetWidth / - 2, canvas.offsetWidth / 2, canvas.offsetHeight / 2, canvas.offsetHeight / - 2, 1, 100000);
  camera.up.x = 0;
  camera.up.y = 0;
  camera.up.z = 1;
  camera.position.set(-_xyFarthest, -_xyFarthest, zRange.max);
  camera.lookAt(0, 0, zRange.min);
  canvas.style.display = "none";
  // 监听鼠标动作
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = autoRotate;

  function buildSpatialTrack() {
    // 轨迹点
    var points = trackPoints.map(function (p) {
      return new THREE.Vector3(p.x, p.y, depthToZ(p.depth));
    });
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var trackLine = new THREE.Line(geometry, trackLineMaterial);
    scene.add(trackLine);
    // 在xoy平面上的投影线
    var points = trackPoints.map(function (p) {
      return new THREE.Vector3(p.x, p.y, 0);
    });
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var projectionLine = new THREE.Line(geometry, projectionLineMaterial);
    scene.add(projectionLine);
    // 垂线
    for (var i = 0; i < trackPoints.length; i++) {
      var points = [];
      var point = trackPoints[i];
      points.push(new THREE.Vector3(point.x, point.y, depthToZ(point.depth)));
      points.push(new THREE.Vector3(point.x, point.y, 0));
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(geometry, verticalLineMaterial);
      // 如果要绘制虚线则需要调用此函数
      line.computeLineDistances();
      scene.add(line);
    }

    useFont(function (font) {
      var fontSize = xyUnit * fontSizeToUnitRatio;
      var fontHeight = xyUnit / 20;
      var textMaterial = new THREE.MeshBasicMaterial({
        color: fontColor,
        side: THREE.DoubleSide
      });
      // x轴上的刻度
      for (var i = 0; i <= (xRange.max - xRange.min) / xyUnit; i++) {
        var text = fAdd(xRange.min, fMul(xyUnit, i)).toString();
        var textGeometry = new THREE.TextGeometry(text, {
          font: font,
          size: fontSize,
          height: fontHeight
        });
        var mesh = new THREE.Mesh(textGeometry, textMaterial);
        mesh.position.x = xRange.min + xyUnit * i - fontSize / 2;
        mesh.position.y = xRange.min - fontSize;
        mesh.position.z = -fontHeight / 2;
        mesh.rotation.z = -Math.PI / 2;
        scene.add(mesh);
      }
      // y轴上的刻度
      for (var i = 0; i <= (yRange.max - yRange.min) / xyUnit; i++) {
        var text = fAdd(yRange.min, fMul(xyUnit, i)).toString();
        var textGeometry = new THREE.TextGeometry(text, {
          font: font,
          size: fontSize,
          height: fontHeight
        });
        var mesh = new THREE.Mesh(textGeometry, textMaterial);
        var box = new THREE.Box3().setFromObject(mesh)
        mesh.position.x = yRange.min - fontSize - (box.max.x - box.min.x);
        mesh.position.y = yRange.min + xyUnit * i - fontSize / 2;
        mesh.position.z = -fontHeight / 2;
        scene.add(mesh);
      }
      // z轴上的刻度
      for (var i = 0; i <= (zRange.max - zRange.min) / zUnit; i++) {
        var text = fSub(maxDepth, fMul(zUnit, i)).toString();
        var textGeometry = new THREE.TextGeometry(text, {
          font: font,
          size: fontSize,
          height: fontHeight
        });
        var mesh = new THREE.Mesh(textGeometry, textMaterial);
        mesh.position.x = fontSize / 2;
        mesh.position.y = -fontHeight / 2;
        mesh.position.z = zRange.min + zUnit * i - fontSize / 2;
        mesh.rotation.x = Math.PI / 2;
        scene.add(mesh);
      }
      // x坐标轴标记
      var textGeometry = new THREE.TextGeometry("X(E)", {
        font: font,
        size: fontSize,
        height: fontHeight
      });
      var mesh = new THREE.Mesh(textGeometry, textMaterial);
      mesh.position.x = xRange.max + xyUnit + arrowHeight + fontSize / 2;
      mesh.position.y = -fontSize / 2;
      mesh.position.z = -fontHeight / 2;
      scene.add(mesh);
      // y坐标轴标记
      var textGeometry = new THREE.TextGeometry("Y(N)", {
        font: font,
        size: fontSize,
        height: fontHeight
      });
      var mesh = new THREE.Mesh(textGeometry, textMaterial);
      mesh.position.x = -fontSize / 2;
      mesh.position.y = yRange.max + xyUnit + arrowHeight + fontSize / 2;
      mesh.position.z = -fontHeight / 2;
      scene.add(mesh);
      // z坐标轴标记
      var text = "Z(depth)";
      var textGeometry = new THREE.TextGeometry(text, {
        font: font,
        size: fontSize,
        height: fontHeight
      });
      var mesh = new THREE.Mesh(textGeometry, textMaterial);
      mesh.position.x = -(fontSize * text.length) / 3;
      mesh.position.y = -fontHeight / 2;
      mesh.position.z = zRange.max + arrowHeight + fontSize / 2;
      mesh.rotation.x = Math.PI / 2;
      scene.add(mesh);
    });

    // 与y轴平行的坐标网格线
    for (var i = 0; i <= (xRange.max - xRange.min) / xyUnit; i++) {
      var points = [];
      var x = xRange.min + xyUnit * i;
      if (x === 0) continue;
      points.push(new THREE.Vector3(x, yRange.min, zRange.min)); //
      points.push(new THREE.Vector3(x, yRange.max, zRange.min)); //
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(geometry, material);
      scene.add(line);
    }

    // 与x轴平行的坐标网格线
    for (var i = 0; i <= (yRange.max - yRange.min) / xyUnit; i++) {
      var points = [];
      var y = yRange.min + xyUnit * i;
      if (y === 0) continue;
      points.push(new THREE.Vector3(xRange.min, y, zRange.min)); //
      points.push(new THREE.Vector3(xRange.max, y, zRange.min)); //
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(geometry, material);
      scene.add(line);
    }

    // x坐标轴
    var points = [];
    points.push(new THREE.Vector3(xRange.min, 0, zRange.min)); // x轴最左边
    points.push(new THREE.Vector3(xRange.max + xyUnit, 0, zRange.min)); // x轴最右边
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var xAxis = new THREE.Line(geometry, xAxisMaterial);
    scene.add(xAxis);
    // x轴的箭头
    var points = [];
    points.push(new THREE.Vector3(xRange.max + xyUnit, arrowWidth / 2, zRange.min));
    points.push(new THREE.Vector3(xRange.max + xyUnit, -arrowWidth / 2, zRange.min));
    points.push(new THREE.Vector3(xRange.max + xyUnit + arrowHeight, 0, zRange.min));
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var xAxisArrow = new THREE.Mesh(geometry, xAxisMaterial);
    scene.add(xAxisArrow);
    // y坐标轴
    var points = [];
    points.push(new THREE.Vector3(0, yRange.min, zRange.min)); //
    points.push(new THREE.Vector3(0, yRange.max + xyUnit, zRange.min)); //
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var yAxis = new THREE.Line(geometry, yAxisMaterial);
    scene.add(yAxis);
    // y轴的箭头
    var points = [];
    points.push(new THREE.Vector3(-arrowWidth / 2, yRange.max + xyUnit, zRange.min));
    points.push(new THREE.Vector3(arrowWidth / 2, yRange.max + xyUnit, zRange.min));
    points.push(new THREE.Vector3(0, yRange.max + xyUnit + arrowHeight, zRange.min));
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var yAxisArrow = new THREE.Mesh(geometry, yAxisMaterial);
    scene.add(yAxisArrow);
    // z坐标轴
    var points = [];
    points.push(new THREE.Vector3(0, 0, zRange.min)); //
    points.push(new THREE.Vector3(0, 0, zRange.max)); //
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var zAxis = new THREE.Line(geometry, zAxisMaterial);
    scene.add(zAxis);
    var points = [];
    points.push(new THREE.Vector3(-arrowWidth / 2, 0, zRange.max));
    points.push(new THREE.Vector3(arrowWidth / 2, 0, zRange.max));
    points.push(new THREE.Vector3(0, 0, zRange.max + arrowHeight));
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var zAxisArrow = new THREE.Mesh(geometry, zAxisMaterial);
    scene.add(zAxisArrow);
  }
  spatialTrack = new CanvasGraph(buildSpatialTrack, {
    renderer: renderer,
    scene: scene,
    camera: camera,
    controls: controls
  });
  canvas.addEventListener("click", function () {
    controls.autoRotate = false;
  });
  canvas.addEventListener("touchstart", function () {
    controls.autoRotate = false;
  });
}

function initHorizontalProjection() {
  var xyGridNum = 10, fontSizeToUnitRatio = .3, xyUnit;
  var xAxisColor = "#ff0000", yAxisColor = "#00ff00";
  var fontColor = baseColor, trackLineColor = baseColor;
  var canvas = document.getElementById("horizontalProjection");
  // 暂时先让画布显示,因为计算摄像机高度时需要知道画布的宽高
  canvas.style.display = "";
  // 设置从配置文件中自定义的一些参数
  if (configObj && configObj.horizontalProjection) {
    var config = configObj.horizontalProjection;
    xyGridNum = config.xyGridNum || xyGridNum;
    xAxisColor = config.xAxisColor || xAxisColor;
    yAxisColor = config.yAxisColor || yAxisColor;
    fontColor = config.fontColor || fontColor;
    trackLineColor = config.trackLineColor || trackLineColor;
    fontSizeToUnitRatio = config.fontSizeToUnitRatio || fontSizeToUnitRatio;
  }
  var xAxisMaterial = new THREE.LineBasicMaterial({color: xAxisColor, side: THREE.DoubleSide});
  var yAxisMaterial = new THREE.LineBasicMaterial({color: yAxisColor, side: THREE.DoubleSide});
  var trackLineMaterial = new THREE.LineBasicMaterial({color: trackLineColor, side: THREE.DoubleSide});
  // 获取一个合适的网格大小,xoy平面
  var gridSize = getApproximateGridSize(xyFarthest, xyGridNum, factorArray);
  var _xyFarthest = fMul(xyGridNum, gridSize);
  xyUnit = gridSize;

  // 寻找上下左右四个方向的边界
  var left = Math.min.apply(null, xs.concat(targetPoints.map(function (p) {
    return p.x - p.r; // 靶圈的左边界
  })));
  var bottom = Math.min.apply(null, ys.concat(targetPoints.map(function (p) {
    return p.y - p.r; // 靶圈的下边界
  })));
  var top = Math.max.apply(null, ys.concat(targetPoints.map(function (p) {
    return p.y + p.r; // 靶圈的上边界
  })));
  var right = Math.max.apply(null, xs.concat(targetPoints.map(function (p) {
    return p.x + p.r; // 靶圈的右边界
  })));
  left = left >= 0 ? 0 : -fMul(Math.ceil(fDivision(-left, xyUnit)), xyUnit);
  bottom = bottom >= 0 ? 0 : -fMul(Math.ceil(fDivision(-bottom, xyUnit)), xyUnit);
  top = top >= 0 ? fMul(Math.ceil(fDivision(top, xyUnit)), xyUnit) : xyUnit;
  right = right >= 0 ? fMul(Math.ceil(fDivision(right, xyUnit)), xyUnit) : xyUnit;
  var planeWidth = fSub(right, left), planeHeight = fSub(top, bottom); // 坐标平面的宽高
  var difference = fSub(planeHeight, planeWidth);
  var gain = fMul(Math.ceil(fDivision(Math.abs(difference), xyUnit)), xyUnit);
  if (difference > 0) {
    if (Math.abs(left) > Math.abs(right)) {
      right = fAdd(right, gain);
    } else {
      left = fSub(left, gain);
    }
  } else {
    if (Math.abs(top) > Math.abs(bottom)) {
      top = fAdd(top, gain);
    } else {
      bottom = fSub(bottom, gain);
    }
  }
  planeWidth = fSub(right, left);
  planeHeight = fSub(top, bottom);
  // 计算网格区域的中点,让摄像机对准网格区域的中点
  var centerX = fDivision(fAdd(left, right), 2);// 坐标网格中心点的x坐标
  var centerY = fDivision(fAdd(top, bottom), 2);// 坐标网格中心点的y坐标
  var cameraZ = getCameraHeightFullContain(planeWidth, planeHeight, canvas.offsetWidth, canvas.offsetHeight, vViewAngle);//相机的z坐标
  cameraZ *= 1.2;

  var xRange = {min: left, max: right}; // x坐标轴的范围
  var yRange = {min: bottom, max: top}; // y坐标轴的范围
  var arrowWidth = xyUnit / 2, arrowHeight = xyUnit; // 坐标轴箭头的底部宽度和高度,以箭头向上指为准,箭头为平面箭头
  // 渲染器
  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: canvas,
    preserveDrawingBuffer: true
  });
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  renderer.setClearColor(new THREE.Color("white"));
  // 场景
  var scene = new THREE.Scene();
  // 相机
  var camera = new THREE.PerspectiveCamera(vViewAngle, canvas.offsetWidth / canvas.offsetHeight, 1, 100000);
  camera.up.x = 0;
  camera.up.y = 1;
  camera.up.z = 0;
  camera.position.set(centerX, centerY, cameraZ);
  camera.lookAt(centerX, centerY, 0);
  canvas.style.display = "none";
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableRotate = false;
  controls.target = new THREE.Vector3(centerX, centerY, 0);

  function buildHorizontalProjection() {
    // 轨迹点
    var points = trackPoints.map(function (p) {
      return new THREE.Vector3(p.x, p.y, 0);
    });
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var trackLine = new THREE.Line(geometry, trackLineMaterial);
    scene.add(trackLine);
    // x轴
    var points = [];
    points.push(new THREE.Vector3(xRange.min, 0, 0)); // x轴最左边
    points.push(new THREE.Vector3(xRange.max, 0, 0)); // x轴最右边
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var xAxis = new THREE.Line(geometry, xAxisMaterial);
    scene.add(xAxis);
    // y坐标轴
    var points = [];
    points.push(new THREE.Vector3(0, yRange.min, 0)); // y轴最下边
    points.push(new THREE.Vector3(0, yRange.max, 0)); // y轴最上边
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var yAxis = new THREE.Line(geometry, yAxisMaterial);
    scene.add(yAxis);
    // 与y轴平行的坐标网格线
    for (var i = 0; i <= (xRange.max - xRange.min) / xyUnit; i++) {
      var points = [];
      var x = xRange.min + xyUnit * i;
      if (x === 0) continue;
      points.push(new THREE.Vector3(x, yRange.min, 0));
      points.push(new THREE.Vector3(x, yRange.max, 0));
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(geometry, material);
      scene.add(line);
    }
    // 与x轴平行的坐标网格线
    for (var i = 0; i <= (yRange.max - yRange.min) / xyUnit; i++) {
      var points = [];
      var y = yRange.min + xyUnit * i;
      if (y === 0) continue;
      points.push(new THREE.Vector3(xRange.min, y, 0));
      points.push(new THREE.Vector3(xRange.max, y, 0));
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(geometry, material);
      scene.add(line);
    }
    // 靶点
    var text = "+";
    var segments = 64;// 把圆分成线段的数目;
    var fontHeight = xyUnit / 20;
    var fontSize = xyUnit * fontSizeToUnitRatio;
    var textMaterial = new THREE.MeshBasicMaterial({color: fontColor, side: THREE.DoubleSide});
    var targetCenterMaterial = new THREE.PointsMaterial({color: baseColor, size: xyUnit / 5});
    var targetCircleMaterial = new THREE.LineBasicMaterial({color: baseColor});
    targetPoints.forEach(function (p) {
      // 靶心
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, 0], 3));
      var point = new THREE.Points(geometry, targetCenterMaterial);
      scene.add(point);
      // 靶圈
      var points = [];
      for(var i = 0; i <= segments; i++) {
        var angle = (i / segments) * (2 * Math.PI);
        points.push(new THREE.Vector3(Math.cos(angle) * p.r + p.x, Math.sin(angle) * p.r + p.y, 0));
      }
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var circle = new THREE.Line(geometry, targetCircleMaterial);
      scene.add(circle);
      // 计算靶圈和轨迹曲线的相交点
      for (var i = 0; i < trackPoints.length - 1; i++) {
        if (p.depth < trackPoints[i].depth || p.depth > trackPoints[i + 1].depth)
          continue;
        var ratio = (p.depth - trackPoints[i+1].depth) / (trackPoints[i].depth - trackPoints[i+1].depth);
        var x = trackPoints[i+1].x + (trackPoints[i].x - trackPoints[i+1].x) * ratio;
        var y = trackPoints[i+1].y + (trackPoints[i].y - trackPoints[i+1].y) * ratio;
        if (Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) <= p.r) {
          // 用+绘制交叉点
          useFont(function (font) {
            var textGeometry = new THREE.TextGeometry(text, {
              font: font,
              size: fontSize,
              height: fontHeight
            });
            var mesh = new THREE.Mesh(textGeometry, textMaterial);
            var box = new THREE.Box3().setFromObject(mesh)
            mesh.position.x = x - (box.max.x - box.min.x) / 2;
            mesh.position.y = y - (box.max.y - box.min.y) / 2;
            mesh.position.z = -fontHeight / 2;
            scene.add(mesh);
          });
        }
      }
    });
    useFont(function (font) {
      var fontSize = xyUnit * fontSizeToUnitRatio;
      var fontHeight = xyUnit / 20;
      var textMaterial = new THREE.MeshBasicMaterial({
        color: fontColor,
        side: THREE.DoubleSide
      });
      // x轴上的刻度
      for (var i = 0; i <= (xRange.max - xRange.min) / xyUnit; i++) {
        var text = fAdd(xRange.min, fMul(xyUnit, i)).toString();
        if (text === '0') continue;
        var textGeometry = new THREE.TextGeometry(text, {
          font: font,
          size: fontSize,
          height: fontHeight
        });
        var mesh = new THREE.Mesh(textGeometry, textMaterial);
        var box = new THREE.Box3().setFromObject(mesh)
        mesh.position.x = xRange.min + xyUnit * i - fontSize / 2;
        mesh.position.y = (box.max.x - box.min.x) / 2;
        mesh.position.z = -fontHeight / 2;
        mesh.rotation.z = -Math.PI / 2;
        scene.add(mesh);
      }
      // y轴上的刻度
      for (var i = 0; i <= (yRange.max - yRange.min) / xyUnit; i++) {
        var text = fAdd(yRange.min, fMul(xyUnit, i)).toString();
        var textGeometry = new THREE.TextGeometry(text, {
          font: font,
          size: fontSize,
          height: fontHeight
        });
        var mesh = new THREE.Mesh(textGeometry, textMaterial);
        var box = new THREE.Box3().setFromObject(mesh);
        mesh.position.x = - (box.max.x - box.min.x) / 2;
        mesh.position.y = yRange.min + xyUnit * i - fontSize / 2;
        mesh.position.z = -fontHeight / 2;
        scene.add(mesh);
      }
      // x坐标轴标记
      var textGeometry = new THREE.TextGeometry("X(E)", {
        font: font,
        size: fontSize,
        height: fontHeight
      });
      var mesh = new THREE.Mesh(textGeometry, textMaterial);
      mesh.position.x = xRange.max + fontSize;
      mesh.position.y = -fontSize / 2;
      mesh.position.z = -fontHeight / 2;
      scene.add(mesh);
      // y坐标轴标记
      var textGeometry = new THREE.TextGeometry("Y(N)", {
        font: font,
        size: fontSize,
        height: fontHeight
      });
      var mesh = new THREE.Mesh(textGeometry, textMaterial);
      var box = new THREE.Box3().setFromObject(mesh);
      mesh.position.x = -(box.max.x - box.max.y) / 2;
      mesh.position.y = yRange.max + fontSize;
      mesh.position.z = -fontHeight / 2;
      scene.add(mesh);
    });
  }
  horizontalProjection = new CanvasGraph(buildHorizontalProjection, {
    renderer: renderer,
    scene: scene,
    camera: camera,
    controls: controls
  });
}

function initVerticalProjection() {
  var gridNum = 10, fontSizeToUnitRatio = .3;
  var hAxisColor = "#ff0000", vAxisColor = "#00ff00", fontColor = baseColor;
  var trackLineColor = "#cf52a3", kopLineColor = "#aa6973", targetCircleColor = "#0572b8";
  var hTracks = hTrackPoints;
  var hTargets = hTargetPoints;
  // 设置从配置文件中自定义的一些参数
  if (config) {
    gridNum = config.gridNum || gridNum;
    hAxisColor = config.xAxisColor || hAxisColor;
    vAxisColor = config.depthAxisColor || vAxisColor;
    fontColor = config.fontColor || fontColor;
    fontSizeToUnitRatio = config.fontSizeToUnitRatio || fontSizeToUnitRatio;
    trackLineColor = config.trackLineColor || trackLineColor;
  }
  var xAxisMaterial = new THREE.LineBasicMaterial({color: hAxisColor});
  var yAxisMaterial = new THREE.LineBasicMaterial({color: vAxisColor});
  var trackLineMaterial = new THREE.LineBasicMaterial({color: trackLineColor});
  // 获取一个合适的网格大小,xoy平面
  var farthest = Math.max(Math.max.apply(null, depths), Math.abs(Math.max.apply(null, hTracks)), Math.abs(Math.min.apply(null, hTracks)));
  var gridUnit = getApproximateGridSize(farthest, gridNum, factorArray);
  var depthToY = function(depth) {return -depth};
  var yToDepth = function(y) {return -y};
  var hRange = {
    min: -fMul(Math.round(gridNum / 2), gridUnit),
    max: fMul(Math.round(gridNum / 2), gridUnit)
  }; // 横轴坐标的范围
  var vRange = {
    min: depthToY(fMul(gridNum, gridUnit)),
    max: 0
  }; // 纵轴坐标的范围
  var canvas = document.getElementById(canvasId);
  // 暂时先让画布显示,因为需要知道画布的宽高
  canvas.style.display = "";
  // 渲染器
  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: canvas,
    preserveDrawingBuffer: true // 设置为true才能导出图片
  });
  var centerY = (vRange.min + vRange.max) / 2;
  var cameraZ = getCameraHeightFullContain(hRange.max - hRange.min, vRange.max - vRange.min, canvas.offsetWidth, canvas.offsetHeight, vViewAngle);//相机的z坐标
  cameraZ *= 1.2;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(vViewAngle, canvas.offsetWidth / canvas.offsetHeight, 1, 100000);
  camera.position.set(0, centerY, cameraZ);
  camera.lookAt(0, centerY, 0);
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  renderer.setClearColor(new THREE.Color("white"));
  canvas.style.display = "none";
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableRotate = false;
  controls.target = new THREE.Vector3(0, centerY, 0);
  canvas.style.display = "none";
  function buildVerticalProjectionEW() {
    // 与y轴平行的坐标网格线
    for (var i = 0; i <= (hRange.max - hRange.min) / gridUnit; i++) {
      var points = [];
      var x = hRange.min + gridUnit * i;
      if (x === 0) continue;
      points.push(new THREE.Vector3(x, vRange.min, 0));
      points.push(new THREE.Vector3(x, vRange.max, 0));
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(geometry, material);
      scene.add(line);
    }
    // 与x轴平行的坐标网格线
    for (var i = 0; i <= (vRange.max - vRange.min) / gridUnit; i++) {
      var points = [];
      var y = vRange.min + gridUnit * i;
      if (y === 0) continue;
      points.push(new THREE.Vector3(hRange.min, y, 0));
      points.push(new THREE.Vector3(hRange.max, y, 0));
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var line = new THREE.Line(geometry, material);
      scene.add(line);
    }
    // x轴
    var points = [];
    points.push(new THREE.Vector3(hRange.min, 0, 0)); // x轴最左边
    points.push(new THREE.Vector3(hRange.max, 0, 0)); // x轴最右边
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var xAxis = new THREE.Line(geometry, xAxisMaterial);
    scene.add(xAxis);
    // y坐标轴
    var points = [];
    points.push(new THREE.Vector3(0, vRange.min, 0)); // y轴最下边
    points.push(new THREE.Vector3(0, vRange.max, 0)); // y轴最上边
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var yAxis = new THREE.Line(geometry, yAxisMaterial);
    scene.add(yAxis);
    // 轨迹点
    var points = trackPoints.map(function (p,i) {
      return new THREE.Vector3(hTracks[i], depthToY(p.depth), 0);
    });
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var trackLine = new THREE.Line(geometry, trackLineMaterial);
    scene.add(trackLine);
    // 造斜点
    if (kop) {
      var points = [];
      points.push(new THREE.Vector3(-gridUnit / 5, depthToY(kop), 0));
      points.push(new THREE.Vector3(gridUnit / 5, depthToY(kop), 0));
      var kopLineMaterial = new THREE.LineBasicMaterial({color: kopLineColor});
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var kopLine = new THREE.Line(geometry, kopLineMaterial);
      scene.add(kopLine);
    }
    // 靶圈的投影
    if (targetPoints.length > 0) {
      var targetCircleMaterial = new THREE.LineBasicMaterial({color: targetCircleColor});
      targetPoints.forEach(function(p, i) {
        var points = [];
        points.push(new THREE.Vector3(hTargets[i] - p.r, depthToY(p.depth), 0));
        points.push(new THREE.Vector3(hTargets[i] + p.r, depthToY(p.depth), 0));
        geometry = new THREE.BufferGeometry().setFromPoints(points);
        var targetCircle = new THREE.Line(geometry, targetCircleMaterial);
        scene.add(targetCircle);
      });
    }
    useFont(function (font) {
      var fontSize = gridUnit * fontSizeToUnitRatio;
      var fontHeight = gridUnit / 20;
      var textMaterial = new THREE.MeshBasicMaterial({
        color: fontColor,
      });
      // x轴上的刻度
      for (var i = 0; i <= (hRange.max - hRange.min) / gridUnit; i++) {
        var text = fAdd(hRange.min, fMul(gridUnit, i)).toString();
        var textGeometry = new THREE.TextGeometry(text, {
          font: font,
          size: fontSize,
          height: fontHeight
        });
        var mesh = new THREE.Mesh(textGeometry, textMaterial);
        mesh.rotation.z = -Math.PI / 2;
        var box = new THREE.Box3().setFromObject(mesh)
        mesh.position.x = hRange.min + gridUnit * i - fontSize / 2;
        mesh.position.y = (box.max.y - box.min.y) + fontSize / 2;
        mesh.position.z = -fontHeight / 4;
        scene.add(mesh);
      }
      // y轴上的刻度
      for (var i = 0; i <= (vRange.max - vRange.min) / gridUnit; i++) {
        var text = fAdd(vRange.min, fMul(gridUnit, i)).toString();
        if (text === '0') continue;
        var textGeometry = new THREE.TextGeometry(text, {
          font: font,
          size: fontSize,
          height: fontHeight
        });
        var mesh = new THREE.Mesh(textGeometry, textMaterial);
        var box = new THREE.Box3().setFromObject(mesh)
        mesh.position.x = - (box.max.x - box.min.x) / 2;
        mesh.position.y = vRange.min + gridUnit * i + fontSize / 4;
        mesh.position.z = -fontHeight / 2;
        scene.add(mesh);
      }
    });
  }
  var graphObj = new CanvasGraph(buildVerticalProjectionEW, {
    renderer: renderer,
    scene: scene,
    camera: camera,
    controls: controls
  });
  if (canvasId === 'verticalProjectionEW') {
    verticalProjectionEW = graphObj;
  } else if (canvasId === 'verticalProjectionNS') {
    verticalProjectionNS = graphObj;
  }
}

var canvasId, config, hTargetPoints, hTrackPoints;
function initVerticalProjectionEW() {
  canvasId = 'verticalProjectionEW';
  config = configObj && configObj.verticalProjectionEW;
  hTargetPoints = targetPoints.map(function(p) {return p.x}); // 靶点的横轴坐标
  hTrackPoints = xs; // 轨迹点的横轴坐标
  initVerticalProjection();
}

function initVerticalProjectionNS() {
  canvasId = 'verticalProjectionNS';
  config = configObj && configObj.verticalProjectionNS;
  hTargetPoints = targetPoints.map(function(p) {return p.y}); // 靶点的横轴坐标
  hTrackPoints = ys; // 轨迹点的横轴坐标
  initVerticalProjection();
}

/**
 * 根据一个坐标值获取合适的网格大小
 * @param {number} number
 * @param {number} piece - 要将坐标轴分为piece个格子
 * @param {array[]} grids - 一个系数数组,格子的长度必须是数组中某个数的倍数
 */
function  getApproximateGridSize(number, piece, grids) {
  if (grids.length === 0) return;
  grids.sort(function (a, b) {
    return b - a;
  });
  var a = fDivision(number, piece);
  for (var j = 0; j < grids.length; j++) {
    if (grids[j] <= a) {
      a = grids[j];
      break;
    } else if (j === grids.length - 1) {
      return;
    }
  }
  var times = Math.ceil(fDivision(number, fMul(a, piece)));
  a = fMul(a, times);
  return a;
}

// 画图完成后需要完成的动作
function postDrawFinished() {
  // 隐藏加载中提示
  var loading = document.getElementById("loadingText");
  if (loading) {
    loading.style.display = "none";
  }
}

/**
 *
 * @param objWidth - 物体的宽度
 * @param objHeight - 物体的高度
 * @param canvasWidth - 画布的宽度
 * @param canvasHeight - 画布的高度
 * @param fov - 相机的垂直视角
 * @return {number}
 */
function getCameraHeightFullContain(objWidth, objHeight, canvasWidth, canvasHeight, fov) {
  var cameraZ;
  if ((canvasWidth / canvasHeight) > (objWidth / objHeight)) {
    cameraZ = (objHeight / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  } else {
    var screenHeight = objHeight * ((canvasHeight / canvasWidth) / (objHeight / objWidth));
    cameraZ = (screenHeight / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  }
  return cameraZ;
}

// 页面初始化时出现异常,提示用户并抛出异常
function triggerInitError(text) {
  var loading = document.getElementById("loadingText");
  if (loading) {
    loading.innerText = text;
    loading.style.color = "red";
  }
  throw Error(text);
}

function init() {
  // 加载配置文件
  loadConfigFile();
}

function initGraph() {
  initSpatialTrack();
  initHorizontalProjection();
  initVerticalProjectionEW();
  initVerticalProjectionNS();
  curGraph = spatialTrack;
  curGraph.show();
  postDrawFinished();
}

// 获取靶点数据
function fetchTargetPoints() {
  var targetPointsDataURL = configObj.targetPointsDataURL;
  var xhr = new XMLHttpRequest();
  xhr.open("GET", targetPointsDataURL);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          var defaultTargetRadius = 0;
          if (configObj && configObj.defaultTargetRadius) {
            defaultTargetRadius = configObj.defaultTargetRadius;
          }
          targetPoints = JSON5.parse(xhr.responseText);
          targetPoints = targetPoints.map(function (p) {
            return {
              y: (p.xzb - p.jkzzbx),
              x: (p.yzb - p.jkhzby),
              depth: p.csb,
              r: p.ybbqbj === null ? defaultTargetRadius : p.ybbqbj
            }
          });
        } catch (e) {
          triggerInitError("靶点数据不是一个有效的对象!");
        }
      } else {
        triggerInitError("靶点数据加载失败!");
      }
      initGraph();
    }
  }
  xhr.send();
}

// 获取轨迹点数据
function fetchTrackPoints() {
  // var trackPointDataURL = configObj.trackPointDataURL;
  // var xhr = new XMLHttpRequest();
  // xhr.open("GET", trackPointDataURL);
  // xhr.onreadystatechange = function () {
  //   if (xhr.readyState === 4) {
  //     if (xhr.status === 200) {
  //       try {
  //         trackPoints = JSON5.parse(xhr.responseText);
  //       } catch (e) {
  //         triggerInitError("轨迹点数据不是一个有效的对象!");
  //       }
        // 设置造斜点
        if (trackPoints[0] && trackPoints[0].zxd) {
          kop = parseFloat(trackPoints[0].zxd);
        }
        trackPoints = trackPoints.map(function (p) {
          return {
            x: parseFloat(p.dxpy),
            y: parseFloat(p.nbpy),
            depth: parseFloat(p.cs)
          }
        });
        xs = trackPoints.map(function (p) {
          return p.x
        });
        ys = trackPoints.map(function (p) {
          return p.y
        });
        // 深度数据,>=0
        depths = trackPoints.map(function (p) {
          return p.depth
        });
        // xy坐标平面大小
        // x,y坐标中绝对值最大的数
        xyFarthest = Math.max(Math.abs(Math.max.apply(null, xs)), Math.abs(Math.min.apply(null, xs)),
            Math.abs(Math.max.apply(null, ys)), Math.abs(Math.min.apply(null, ys)));
      // } else {
      //   triggerInitError("加载轨迹点数据失败!");
      // }
      // fetchTargetPoints();
      initGraph();
    // }
  // };
  // xhr.send();
}

// 加载配置文件
function loadConfigFile() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", configPath);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        try {
          configObj = JSON5.parse(xhr.responseText);
        } catch (e) {
          triggerInitError("配置对象不是一个有效的对象!");
        }
      } else {
        triggerInitError("配置文件加载失败,请检查配置文件的位置!");
      }
      fetchTrackPoints();
    }
  };
  xhr.send();
}

function CanvasGraph(init, config) {
  if (!init) {
    throw Error("缺乏必要的初始化函数!");
  }
  var initialized = false;
  var initFunc = init;

  var controls = config.controls;
  var renderer = config.renderer;
  var scene = config.scene;
  var camera = config.camera;
  var canvas = null;
  this.canvas = canvas;
  if (!renderer) {
    throw Error("没有渲染器参数!");
  }
  if (!camera) {
    throw Error("没有相机参数!");
  }
  canvas = renderer.domElement;

  this.show = function () {
    if (canvas && canvas.style) {
      canvas.style.display = "";
      if (!initialized) {
        initFunc.call(this); // 将可绘制的元素添加到scene元素中
        if (controls) { // 如果图形是动态的,则每帧都需要绘制
          animate();
        } else {
          // 不需要每帧都绘制,比如固定位置的平面图
          draw();
        }
        window.addEventListener("resize", windowResize);
        initialized = true;
      } else {
        draw();
      }
    }
  }

  this.hide = function () {
    if (canvas && canvas.style) {
      canvas.style.display = "none";
    }
  }

  // 使图像回到页面加载时的位置
  this.reset = function () {
    if (controls) {
      controls.reset();
    }
  }

  // 将画布导出为图片
  this.export = function () {
    if (canvas) {
      var link = document.createElement("a");
      link.download = "canvas.png";
      link.href = canvas.toDataURL();
      link.click();
      link.remove();
    }
  }

  if (controls) {
    this.startRotate = function () {
      controls.autoRotate = true;
    }
    this.stopRotate = function () {
      controls.autoRotate = false;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    if (controls) {
      controls.update();
    }
    renderer.render(scene, camera);
  }

  // 按窗口比例绘制
  function draw() {
    var width = canvas.offsetWidth, height = canvas.offsetHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.render(scene, camera);
  }

  function windowResize() {
    // 避免在隐藏时绘制,隐藏时无法得到画布的宽高
    if (canvas.style.display !== "none") {
      draw();
    }
  }
}

// js中的浮点数运算存在误差,必要时使用下面的函数替代
// 浮点数乘法
function fMul(a, b) {
  var m = 0, n = 0, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, m + n); //将数字转换为整数的最大倍数
  return Number(d.replace(".", "")) * Number(e.replace(".", "")) / maxInt;
}

// 浮点数加法
function fAdd(a, b) {
  var m = 0, n = 0, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, Math.max(m, n)); //将数字转换为整数的最大倍数
  return (fMul(a, maxInt) + fMul(b, maxInt)) / maxInt;
}

// 浮点数减法
function fSub(a, b) {
  var m = 0, n = 0, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, Math.max(m, n)); //将数字转换为整数的最大倍数
  return (fMul(a, maxInt) - fMul(b, maxInt)) / maxInt;
}

// 浮点数除法
function fDivision(a, b) {
  var m = 0, n = 0, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, Math.max(n, m)); //将数字转换为整数的最大倍数
  var aInt = fMul(a, maxInt);
  var bInt = fMul(b, maxInt);
  return aInt / bInt;
}
