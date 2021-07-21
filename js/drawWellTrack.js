window.addEventListener("load", function () {
  loading = document.getElementById("loadingText");
  // 添加事件监听器
  eventListen();
  // 加载数据并绘图
  init();
});

// 公共变量
var urlParams = parseUrlParam(location.href);
var realKop; // 实钻线造斜点的深度
var designKop; // 设计钻线造斜点的深度
var defaultTargetRadius = 0; // 默认的靶半径
var defaultWellNO = "JS2020112001", defaultGraphType = "spatialTrack";
var initWellNO = urlParams.wellNO || defaultWellNO; // 页面的第一次加载时显示的井的井号
var wellName; // 井名
var vViewAngle = 45; // 摄像机垂直方向的视野角度
var geometry, configObj, externalDataTransceiver;
// xy坐标平面大小
// x,y坐标中绝对值最大的数
var xyFarthest, realXs = [], designXs = [], realYs = [], designYs = [], realDepths = [], designDepths = [], allXs = [], allYs = [];
var curGraph; // 当前页面显示的图像
var spatialTrack, verticalProjectionEW, horizontalProjection, verticalProjectionNS;
var fontPath = './font/optimer_regular.typeface.json';
var configPath = 'config.json';
var baseColor = "#000000";
var factorArray = [10000, 1000, 100, 10, 1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001];
var realTrackPoints = [], designTrackPoints = [], designTargetPoints = [], realTargetPoints = [];
var material = new THREE.LineBasicMaterial({color: baseColor});
var loading; // 加载中dom对象

// 使用FontLoader加载的字体,接受一个回调函数
// 回调函数的参数是字体对象
var useFont = function () {
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
        }, 25);
      }
    }
  }
}();

function initSpatialTrack() {
  var autoRotate = true, realDrillLines, designDrillLines;
  var xyGridNum = 10, zGridNum = 10, maxZToXyRatio = 2, fontSizeToUnitRatio = .3, xyUnit, zUnit;
  var xAxisColor = "#ff0000", yAxisColor = "#00ff00", zAxisColor = "#0000ff";
  var designVerticalLineColor = "#8a2be2", designTrackLineColor = "#8a2be2", designProjectionLineColor = "#8a2be2";
  var fontColor = baseColor, realTrackLineColor = baseColor, realProjectionLineColor = baseColor, realVerticalLineColor = baseColor;
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
    realVerticalLineColor = config.realVerticalLineColor || realVerticalLineColor;
    realTrackLineColor = config.realTrackLineColor || realTrackLineColor;
    realProjectionLineColor = config.realProjectionLineColor || realProjectionLineColor;
    designVerticalLineColor = config.designVerticalLineColor || designVerticalLineColor;
    designTrackLineColor = config.designTrackLineColor || designTrackLineColor;
    designProjectionLineColor = config.designProjectionLineColor || designProjectionLineColor;
    fontSizeToUnitRatio = config.fontSizeToUnitRatio || fontSizeToUnitRatio;
    if (typeof config.autoRotate === "boolean") {
      autoRotate = config.autoRotate;
    }
  }
  var xAxisMaterial = new THREE.LineBasicMaterial({color: xAxisColor, side: THREE.DoubleSide});
  var yAxisMaterial = new THREE.LineBasicMaterial({color: yAxisColor, side: THREE.DoubleSide});
  var zAxisMaterial = new THREE.LineBasicMaterial({color: zAxisColor, side: THREE.DoubleSide});
  var realTrackLineMaterial = new THREE.LineBasicMaterial({color: realTrackLineColor, side: THREE.DoubleSide});
  var realProjectionLineMaterial = new THREE.LineBasicMaterial({color: realProjectionLineColor, side: THREE.DoubleSide});
  var designTrackLineMaterial = new THREE.LineBasicMaterial({color: designTrackLineColor, side: THREE.DoubleSide});
  var designProjectionLineMaterial = new THREE.LineBasicMaterial({color: designProjectionLineColor, side: THREE.DoubleSide});
  // 设计钻线和实钻线的最大深度
  var maxDepth = Math.max.apply(null, realDepths.concat(designDepths)); // 最大深度
  var _xyFarthest = xyFarthest;
  // if (maxDepth / xyFarthest > maxZToXyRatio) {
  //   _xyFarthest = maxDepth / maxZToXyRatio;
  // }
  // 获取一个合适的网格大小,xoy平面
  xyUnit = getApproximateGridSize(_xyFarthest, xyGridNum, factorArray);
  _xyFarthest = fMul(Math.ceil(fDivision(_xyFarthest, xyUnit)), xyUnit);
  // 获取z轴一个合适的网格大小
  zUnit = getApproximateGridSize(maxDepth, zGridNum, factorArray);

  // 将深度转换为z轴上的坐标
  var depthToZ = function (depth) { return fSub(maxDepth, depth) };
  // 将z轴上的坐标转换为深度
  var zToDepth = function (z) { return fSub(maxDepth, z) };
  var xRange = {min: -_xyFarthest, max: _xyFarthest}; // x坐标轴的范围
  var yRange = {min: -_xyFarthest, max: _xyFarthest}; // y坐标轴的范围
  var zRange = { // z坐标轴的范围
    min: depthToZ(maxDepth),
    max: depthToZ(0) // 深度0在z轴的最上方
  }
  var smallestDashNum = 1; // 在最短的垂线(虚线)上显示的虚线段的数目
  var gapRatio = 1 / 3; // 间隙占虚线端的比例
  var realAltitudeZ = maxDepth - Math.max.apply(null, realDepths); // 深度最大的点距离xoy平面的垂直距离
  var realVerticalLineMaterial = new THREE.LineDashedMaterial({
    color: realVerticalLineColor,
    dashSize: (realAltitudeZ / smallestDashNum) * (1 - gapRatio),
    gapSize: (realAltitudeZ / smallestDashNum) * gapRatio,
  });
  var designAltitudeZ = maxDepth - Math.max.apply(null, designDepths); // 深度最大的点距离xoy平面的垂直距离
  var designVerticalLineMaterial = new THREE.LineDashedMaterial({
    color: designVerticalLineColor,
    dashSize: (designAltitudeZ / smallestDashNum) * (1 - gapRatio),
    gapSize: (designAltitudeZ / smallestDashNum) * gapRatio,
  });
  var arrowWidth = xyUnit / 2, arrowHeight = xyUnit; // 坐标轴箭头的底部宽度和高度,以箭头向上指为准,箭头为平面箭头
  var canvas = document.getElementById("spatialTrack");
  // 暂时先让画布显示,因为需要知道画布的宽高
  canvas.style.display = "";
  // 渲染器
  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: canvas,
    preserveDrawingBuffer: true, // 设置为true才能导出图片
  });
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  renderer.setClearColor(new THREE.Color("white"));
  // 场景
  var scene = new THREE.Scene();
  // 相机
  var camera = new THREE.PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 1, 100000);
  camera.up.x = 0;
  camera.up.y = 0;
  camera.up.z = 1;
  camera.position.set(-2 * _xyFarthest, -2 * _xyFarthest, 2 * _xyFarthest);
  camera.lookAt(0, 0, zRange.min);
  // 监听鼠标动作
  var controls = new THREE.OrbitControls(camera, canvas);
  // 是否开启阻尼效果
  controls.enableDamping = false;
  // 是否开启自动旋转
  controls.autoRotate = autoRotate;

  //// 实钻线
  realDrillLines = new THREE.Group();
  realDrillLines.name = "realDrillLines";
  // 轨迹点
  var points = realTrackPoints.map(function (p) {
    return new THREE.Vector3(p.x, p.y, depthToZ(p.depth));
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var trackLine = new THREE.Line(geometry, realTrackLineMaterial);
  realDrillLines.add(trackLine);
  // 在xoy平面上的投影线
  var points = realTrackPoints.map(function (p) {
    return new THREE.Vector3(p.x, p.y, 0);
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var projectionLine = new THREE.Line(geometry, realProjectionLineMaterial);
  realDrillLines.add(projectionLine);
  // 垂线
  var points = [];
  for (var i = 0; i < realTrackPoints.length; i++) {
    var point = realTrackPoints[i];
    points.push(new THREE.Vector3(point.x, point.y, depthToZ(point.depth)));
    points.push(new THREE.Vector3(point.x, point.y, 0));
  }
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var line = new THREE.LineSegments(geometry, realVerticalLineMaterial);
  // 如果要绘制虚线则需要调用此函数
  line.computeLineDistances();
  realDrillLines.add(line);
  scene.add(realDrillLines);
  //// 设计钻线
  designDrillLines = new THREE.Group();
  designDrillLines.name = "designDrillLines";
  designDrillLines.visible = false;
  // 轨迹点
  var points = designTrackPoints.map(function (p) {
    return new THREE.Vector3(p.x, p.y, depthToZ(p.depth));
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var trackLine = new THREE.Line(geometry, designTrackLineMaterial);
  designDrillLines.add(trackLine);
  // 在xoy平面上的投影线
  var points = designTrackPoints.map(function (p) {
    return new THREE.Vector3(p.x, p.y, 0);
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var projectionLine = new THREE.Line(geometry, designProjectionLineMaterial);
  designDrillLines.add(projectionLine);
  // 垂线
  var points = [];
  for (var i = 0; i < designTrackPoints.length; i++) {
    var point = designTrackPoints[i];
    points.push(new THREE.Vector3(point.x, point.y, depthToZ(point.depth)));
    points.push(new THREE.Vector3(point.x, point.y, 0));
  }
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var line = new THREE.LineSegments(geometry, designVerticalLineMaterial);
  // 如果要绘制虚线则需要调用此函数
  line.computeLineDistances();
  designDrillLines.add(line);
  scene.add(designDrillLines);

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
      // 字形状的立方体
      var box = new THREE.Box3().setFromObject(mesh);
      mesh.position.x = yRange.min - fontSize - (box.max.x - box.min.x);
      mesh.position.y = yRange.min + xyUnit * i - fontSize / 2;
      mesh.position.z = -fontHeight / 2;
      scene.add(mesh);
    }
    // z轴上的刻度,从0开始画
    var markNum = Math.ceil(maxDepth / zUnit);
    for (var i = 0; i < markNum; i++) {
      var depth = fMul(zUnit, i); // 当前刻度上表示的深度值
      var textGeometry = new THREE.TextGeometry(depth.toString(), {
        font: font,
        size: fontSize,
        height: fontHeight
      });
      var mesh = new THREE.Mesh(textGeometry, textMaterial);
      mesh.position.x = fontSize / 2;
      mesh.position.y = -fontHeight / 2;
      mesh.position.z = depthToZ(depth) - fontSize / 2;
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

  var points = [];
  // 与y轴平行的坐标网格线
  for (var i = 0; i <= (xRange.max - xRange.min) / xyUnit; i++) {
    var x = xRange.min + xyUnit * i;
    if (x === 0) continue;
    points.push(new THREE.Vector3(x, yRange.min, zRange.min)); //
    points.push(new THREE.Vector3(x, yRange.max, zRange.min)); //
  }
  // 与x轴平行的坐标网格线
  for (var i = 0; i <= (yRange.max - yRange.min) / xyUnit; i++) {
    var y = yRange.min + xyUnit * i;
    if (y === 0) continue;
    points.push(new THREE.Vector3(xRange.min, y, zRange.min)); //
    points.push(new THREE.Vector3(xRange.max, y, zRange.min)); //
  }
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.LineSegments(geometry, material));

  // x坐标轴
  var points = [];
  points.push(new THREE.Vector3(xRange.min, 0, zRange.min)); // x轴最左边
  points.push(new THREE.Vector3(xRange.max + xyUnit, 0, zRange.min)); // x轴最右边
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var xAxis = new THREE.Line(geometry, xAxisMaterial);
  scene.add(xAxis);
  // x轴的箭头,一个三角形
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
  // z轴的箭头
  var points = [];
  points.push(new THREE.Vector3(-arrowWidth / 2, 0, zRange.max));
  points.push(new THREE.Vector3(arrowWidth / 2, 0, zRange.max));
  points.push(new THREE.Vector3(0, 0, zRange.max + arrowHeight));
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var zAxisArrow = new THREE.Mesh(geometry, zAxisMaterial);
  scene.add(zAxisArrow);
  spatialTrack = new CanvasGraph({
    renderer: renderer,
    scene: scene,
    camera: camera,
    controls: controls
  });
  canvas.style.display = "none";
  // 点击之后关闭自动旋转
  var timerId;
  canvas.addEventListener("click", function () {
    controls.autoRotate = false;
    if (!timerId) {
      timerId = setTimeout(function () {
        controls.autoRotate = true;
        timerId = null;
      }, 10000);
    }
  });
  canvas.addEventListener("touchstart", function () {
    controls.autoRotate = false;
    if (!timerId) {
      timerId = setTimeout(function () {
        controls.autoRotate = true;
        timerId = null;
      }, 10000);
    }
  });
}

function initHorizontalProjection() {
  var xyGridNum = 10, fontSizeToUnitRatio = .3, xyUnit;
  var xAxisColor = "#ff0000", yAxisColor = "#00ff00";
  var fontColor = baseColor, realTrackLineColor = baseColor, designTrackLineColor = fontColor;
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
    realTrackLineColor = config.realTrackLineColor || realTrackLineColor;
    designTrackLineColor = config.designTrackLineColor || designTrackLineColor;
    fontSizeToUnitRatio = config.fontSizeToUnitRatio || fontSizeToUnitRatio;
  }
  var xAxisMaterial = new THREE.LineBasicMaterial({color: xAxisColor, side: THREE.DoubleSide});
  var yAxisMaterial = new THREE.LineBasicMaterial({color: yAxisColor, side: THREE.DoubleSide});
  var realTrackLineMaterial = new THREE.LineBasicMaterial({color: realTrackLineColor, side: THREE.DoubleSide});
  var designTrackLineMaterial = new THREE.LineBasicMaterial({color: designTrackLineColor, side: THREE.DoubleSide});
  // 获取一个合适的网格大小,xoy平面
  xyUnit = getApproximateGridSize(xyFarthest, xyGridNum, factorArray);

  // 寻找上下左右四个方向的边界
  var left = Math.min.apply(null, allXs.concat(realTargetPoints.map(function (p) {
    return p.x - p.r; // 实钻靶圈的左边界
  })).concat(designTargetPoints.map(function (p) {
    return p.x - p.r; // 设计靶圈的左边界
  })));
  var bottom = Math.min.apply(null, allYs.concat(realTargetPoints.map(function (p) {
    return p.y - p.r; // 实钻靶圈的下边界
  })).concat(designTargetPoints.map(function (p) {
    return p.y - p.r; // 设计靶圈的下边界
  })));
  var top = Math.max.apply(null, allYs.concat(realTargetPoints.map(function (p) {
    return p.y + p.r; // 实钻靶圈的上边界
  })).concat(designTargetPoints.map(function (p) {
    return p.y + p.r; // 设计靶圈的上边界
  })));
  var right = Math.max.apply(null, allXs.concat(realTargetPoints.map(function (p) {
    return p.x + p.r; // 靶圈的右边界
  })).concat(designTargetPoints.map(function (p) {
    return p.x + p.r; // 靶圈的上边界
  })));
  left = left >= 0 ? 0 : -fMul(Math.ceil(fDivision(-left, xyUnit)), xyUnit);
  bottom = bottom >= 0 ? 0 : -fMul(Math.ceil(fDivision(-bottom, xyUnit)), xyUnit);
  top = top >= 0 ? fMul(Math.ceil(fDivision(top, xyUnit)), xyUnit) : xyUnit; // x正轴方向至少要有一个格子
  right = right >= 0 ? fMul(Math.ceil(fDivision(right, xyUnit)), xyUnit) : xyUnit; // y轴正轴至少要有一个格子
  var planeWidth = fSub(right, left), planeHeight = fSub(top, bottom); // 坐标网格的宽高
  var difference = fSub(planeHeight, planeWidth);
  var gain = fMul(Math.ceil(fDivision(Math.abs(difference), xyUnit)), xyUnit);
  // 要让网格的左右宽度和上下高度查不多
  // 如果高度大于宽度,宽度要补上相应的差值(差值是格子大小的倍数)
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
  cameraZ *= 1.2; // 选区一个合适的系数,要让网格外的其它元素也显示出来

  var xRange = {min: left, max: right}; // x坐标轴的范围
  var yRange = {min: bottom, max: top}; // y坐标轴的范围
  var arrowWidth = xyUnit / 2, arrowHeight = xyUnit; // 坐标轴箭头的底部宽度和高度,以箭头向上指为准,箭头为平面箭头
  // 渲染器
  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: canvas,
    preserveDrawingBuffer: true,
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
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableRotate = false;
  controls.target = new THREE.Vector3(centerX, centerY, 0);

  var text = "x"; // 用x代表靶圈和轨迹线的相交点
  var segments = 64;// 把圆分成线段的数目;
  var fontHeight = xyUnit / 20; // 字的厚度
  var fontSize = xyUnit * fontSizeToUnitRatio;
  var textMaterial = new THREE.MeshBasicMaterial({color: fontColor, side: THREE.DoubleSide});
  // 实钻线
  var realDrillLines = new THREE.Group();
  realDrillLines.name = "realDrillLines"
  // 实钻线靶点
  var targetCenterMaterial = new THREE.PointsMaterial({color: realTrackLineColor, size: xyUnit / 5});
  realTargetPoints.forEach(function (p) {
    // 靶心
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, 0], 3));
    var point = new THREE.Points(geometry, targetCenterMaterial);
    realDrillLines.add(point);
    // 靶圈
    var points = [];
    for(var i = 0; i <= segments; i++) {
      var angle = (i / segments) * (2 * Math.PI);
      points.push(new THREE.Vector3(Math.cos(angle) * p.r + p.x, Math.sin(angle) * p.r + p.y, 0));
    }
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var circle = new THREE.Line(geometry, realTrackLineMaterial);
    realDrillLines.add(circle);
    // 计算靶圈和轨迹曲线的相交点
    var realCrossPointMaterial = new THREE.MeshBasicMaterial({color: realTrackLineColor,});
    for (var i = 0; i < realTrackPoints.length - 1; i++) {
      // 如果靶点的深度不在两个点的深度之间,则一定不相交
      if (p.depth < realTrackPoints[i].depth || p.depth > realTrackPoints[i + 1].depth)
        continue;
      var ratio = (p.depth - realTrackPoints[i+1].depth) / (realTrackPoints[i].depth - realTrackPoints[i+1].depth);
      // 轨迹线和靶圈相交的点
      var x = realTrackPoints[i+1].x + (realTrackPoints[i].x - realTrackPoints[i+1].x) * ratio;
      var y = realTrackPoints[i+1].y + (realTrackPoints[i].y - realTrackPoints[i+1].y) * ratio;
      if (Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) <= p.r) {
        // 用x绘制交叉点
        useFont(function (font) {
          var textGeometry = new THREE.TextGeometry(text, {
            font: font,
            size: fontSize,
            height: fontHeight
          });
          var mesh = new THREE.Mesh(textGeometry, realCrossPointMaterial);
          var box = new THREE.Box3().setFromObject(mesh);
          var h = (box.max.y - box.min.y);
          var w = (box.max.x - box.min.x);
          var theta = Math.atan((realTrackPoints[i+1].y - realTrackPoints[i].y) / (realTrackPoints[i + 1].x - realTrackPoints[i].x));
          var phi = Math.PI / 2 - theta / 2 - Math.atan(h / w);
          mesh.position.x = x - w / 2 + Math.sqrt(Math.pow(w, 2) + Math.pow(h, 2)) * Math.sin(theta / 2) * Math.cos(phi);
          mesh.position.y = y - h / 2 - Math.sqrt(Math.pow(w, 2) + Math.pow(h, 2)) * Math.sin(theta / 2) * Math.sin(phi);
          mesh.position.z = -fontHeight / 2;
          mesh.rotation.z = theta;
          realDrillLines.add(mesh);
        });
      }
    }
  });
  // 实钻线轨迹点
  var points = realTrackPoints.map(function (p) {
    return new THREE.Vector3(p.x, p.y, 0);
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var realTrackLine = new THREE.Line(geometry, realTrackLineMaterial);
  realDrillLines.add(realTrackLine);
  scene.add(realDrillLines);

  // 设计钻线
  var designDrillLines = new THREE.Group();
  designDrillLines.name = "designDrillLines";
  designDrillLines.visible = false;
  // 设计钻线轨迹点
  var points = designTrackPoints.map(function (p) {
    return new THREE.Vector3(p.x, p.y, 0);
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var designTrackLine = new THREE.Line(geometry, designTrackLineMaterial);
  designDrillLines.add(designTrackLine);
  // 实钻线靶点
  var targetCenterMaterial = new THREE.PointsMaterial({color: designTrackLineColor, size: xyUnit / 5});
  designTargetPoints.forEach(function (p) {
    // 靶心
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, 0], 3));
    var point = new THREE.Points(geometry, targetCenterMaterial);
    designDrillLines.add(point);
    // 靶圈
    var points = [];
    // 用若干条直线绘制圆圈
    for(var i = 0; i <= segments; i++) {
      var angle = (i / segments) * (2 * Math.PI);
      points.push(new THREE.Vector3(Math.cos(angle) * p.r + p.x, Math.sin(angle) * p.r + p.y, 0));
    }
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var circle = new THREE.Line(geometry, designTrackLineMaterial);
    designDrillLines.add(circle);
    // 计算靶圈和轨迹曲线的相交点
    var designCrossPointMaterial = new THREE.MeshBasicMaterial({color: designTrackLineColor,});
    for (var i = 0; i < designTrackPoints.length - 1; i++) {
      if (p.depth < designTrackPoints[i].depth || p.depth > designTrackPoints[i + 1].depth)
        continue;
      var ratio = (p.depth - designTrackPoints[i+1].depth) / (designTrackPoints[i].depth - designTrackPoints[i+1].depth);
      var x = designTrackPoints[i+1].x + (designTrackPoints[i].x - designTrackPoints[i+1].x) * ratio;
      var y = designTrackPoints[i+1].y + (designTrackPoints[i].y - designTrackPoints[i+1].y) * ratio;
      if (Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) <= p.r) {
        // 用x绘制交叉点
        useFont(function (font) {
          var textGeometry = new THREE.TextGeometry(text, {
            font: font,
            size: fontSize,
            height: fontHeight
          });
          var mesh = new THREE.Mesh(textGeometry, designCrossPointMaterial);
          var box = new THREE.Box3().setFromObject(mesh);
          var theta = Math.atan((designTrackPoints[i+1].y - designTrackPoints[i].y) / (designTrackPoints[i + 1].x - designTrackPoints[i].x));
          var h = (box.max.y - box.min.y);
          var w = (box.max.x - box.min.x);
          var phi = Math.PI / 2 - theta / 2 - Math.atan(h / w);
          mesh.position.x = x - w / 2 + Math.sqrt(Math.pow(w, 2) + Math.pow(h, 2)) * Math.sin(theta / 2) * Math.cos(phi);
          mesh.position.y = y - h / 2 - Math.sqrt(Math.pow(w, 2) + Math.pow(h, 2)) * Math.sin(theta / 2) * Math.sin(phi);
          mesh.position.z = -fontHeight / 2;
          mesh.rotation.z = theta;
          designDrillLines.add(mesh);
        });
      }
    }
  });
  scene.add(designDrillLines);

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
  var points = [];
  // 与y轴平行的坐标网格线
  for (var i = 0; i <= (xRange.max - xRange.min) / xyUnit; i++) {
    var x = xRange.min + xyUnit * i;
    if (x === 0) continue;
    points.push(new THREE.Vector3(x, yRange.min, 0));
    points.push(new THREE.Vector3(x, yRange.max, 0));
  }
  // 与x轴平行的坐标网格线
  for (var i = 0; i <= (yRange.max - yRange.min) / xyUnit; i++) {
    var y = yRange.min + xyUnit * i;
    if (y === 0) continue;
    points.push(new THREE.Vector3(xRange.min, y, 0));
    points.push(new THREE.Vector3(xRange.max, y, 0));
  }
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.LineSegments(geometry, material));

  useFont(function (font) {
    var fontSize = xyUnit * fontSizeToUnitRatio;
    var fontHeight = xyUnit / 20;
    // x轴上的刻度
    for (var i = 0; i <= (xRange.max - xRange.min) / xyUnit; i++) {
      var text = fAdd(xRange.min, fMul(xyUnit, i)).toString();
      if (text === '0') continue; // 0在y轴的刻度上已经绘制过了
      var textGeometry = new THREE.TextGeometry(text, {
        font: font,
        size: fontSize,
        height: fontHeight
      });
      var mesh = new THREE.Mesh(textGeometry, textMaterial);
      var box = new THREE.Box3().setFromObject(mesh);
      mesh.position.x = xRange.min + xyUnit * i - fontSize / 2;
      mesh.position.y = (box.max.x - box.min.x) / 2;
      mesh.position.z = -fontHeight / 2;
      mesh.rotation.z = -Math.PI / 2; //x轴上的数字要竖着放以免放不开
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
  horizontalProjection = new CanvasGraph({
    renderer: renderer,
    scene: scene,
    camera: camera,
    controls: controls
  });
  canvas.style.display = "none";
}

function initVerticalProjection() {
  var gridNum = 10, fontSizeToUnitRatio = .3;
  var hAxisColor = "#ff0000", vAxisColor = "#00ff00", fontColor = "#8a2be2";
  var realTrackLineColor = "#4caf50", realKopLineColor = "#4caf50", realTargetCircleColor = "#4caf50";
  var designTrackLineColor = "#cf52a3", designKopLineColor = "#cf52a3", designTargetCircleColor = "#cf52a3";
  var directionLabelColor = "purple";
  var hRealTracks = hRealTrackPoints, hRealTargets = hRealTargetPoints, hDesignTracks = hDesignTrackPoints, hDesignTargets = hDesignTargetPoints;

  var directionTxt = directionText;
  // 设置从配置文件中自定义的一些参数
  if (config) {
    gridNum = config.gridNum || gridNum;
    hAxisColor = config.hAxisColor || hAxisColor;
    vAxisColor = config.depthAxisColor || vAxisColor;
    fontColor = config.fontColor || fontColor;
    fontSizeToUnitRatio = config.fontSizeToUnitRatio || fontSizeToUnitRatio;
    realTrackLineColor = config.realTrackLineColor || realTrackLineColor;
    designTrackLineColor = config.designTrackLineColor || designTrackLineColor;
    realKopLineColor = config.realKopLineColor || realKopLineColor;
    designKopLineColor = config.designKopLineColor || designKopLineColor;
    realTargetCircleColor = config.realTargetCircleColor || realTargetCircleColor;
    designTargetCircleColor = config.designTargetCircleColor || designTargetCircleColor;
    directionLabelColor = config.directionLabelColor || directionLabelColor;
  }
  var xAxisMaterial = new THREE.LineBasicMaterial({color: hAxisColor});
  var yAxisMaterial = new THREE.LineBasicMaterial({color: vAxisColor});
  var realTrackLineMaterial = new THREE.LineBasicMaterial({color: realTrackLineColor});
  var designTrackLineMaterial = new THREE.LineBasicMaterial({color: designTrackLineColor});
  var farthest = Math.max(Math.max.apply(null, realDepths), Math.max.apply(null, designDepths),
      Math.abs(Math.max.apply(null, hRealTracks)) * 2, Math.abs(Math.min.apply(null, hRealTracks)) * 2,
      Math.abs(Math.max.apply(null, hDesignTracks)) * 2, Math.abs(Math.min.apply(null, hDesignTracks)) * 2);
  // 获取一个合适的网格大小,xoz平面或yoz平面
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
    preserveDrawingBuffer: true, // 设置为true才能导出图片
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
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableRotate = false;
  controls.target = new THREE.Vector3(0, centerY, 0);
  canvas.style.display = "none";
  // 与y轴平行的坐标网格线
  var points = [];
  for (var i = 0; i <= (hRange.max - hRange.min) / gridUnit; i++) {
    var x = hRange.min + gridUnit * i;
    if (x === 0) continue; // y轴不画
    points.push(new THREE.Vector3(x, vRange.min, 0));
    points.push(new THREE.Vector3(x, vRange.max, 0));
  }
  // 与x轴平行的坐标网格线
  for (var i = 0; i <= (vRange.max - vRange.min) / gridUnit; i++) {
    var y = vRange.min + gridUnit * i;
    if (y === 0) continue; // x轴不画
    points.push(new THREE.Vector3(hRange.min, y, 0));
    points.push(new THREE.Vector3(hRange.max, y, 0));
  }
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.LineSegments(geometry, material));

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

  //// 实钻线
  var realDrillLines = new THREE.Group();
  realDrillLines.name = "realDrillLines"; // 给它一个名字,可以通过这个名字查找并操作它
  // 实钻线轨迹点
  var points = realTrackPoints.map(function (p, i) {
    return new THREE.Vector3(hRealTracks[i], depthToY(p.depth), 0);
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var trackLine = new THREE.Line(geometry, realTrackLineMaterial);
  realDrillLines.add(trackLine);
  // 造斜点
  if (realKop) {
    var points = [];
    points.push(new THREE.Vector3(-gridUnit / 5, depthToY(realKop), 0));
    points.push(new THREE.Vector3(gridUnit / 5, depthToY(realKop), 0));
    var kopLineMaterial = new THREE.LineBasicMaterial({color: realKopLineColor});
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var kopLine = new THREE.Line(geometry, kopLineMaterial);
    realDrillLines.add(kopLine);
  }
  // 靶圈的投影
  if (realTargetPoints.length > 0) {
    var targetCircleMaterial = new THREE.LineBasicMaterial({color: realTargetCircleColor});
    realTargetPoints.forEach(function(p, i) {
      var points = [];
      points.push(new THREE.Vector3(hRealTargets[i] - p.r, depthToY(p.depth), 0));
      points.push(new THREE.Vector3(hRealTargets[i] + p.r, depthToY(p.depth), 0));
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var targetCircle = new THREE.Line(geometry, targetCircleMaterial);
      realDrillLines.add(targetCircle);
    });
  }
  scene.add(realDrillLines);

  //// 设计钻线
  var designDrillLines = new THREE.Group();
  designDrillLines.name = "designDrillLines";
  designDrillLines.visible = false;
  // 设计钻线轨迹点
  var points = designTrackPoints.map(function (p, i) {
    return new THREE.Vector3(hDesignTracks[i], depthToY(p.depth), 0);
  });
  geometry = new THREE.BufferGeometry().setFromPoints(points);
  var trackLine = new THREE.Line(geometry, designTrackLineMaterial);
  designDrillLines.add(trackLine);
  // 造斜点
  if (designKop) {
    var points = [];
    points.push(new THREE.Vector3(-gridUnit / 5, depthToY(designKop), 0));
    points.push(new THREE.Vector3(gridUnit / 5, depthToY(designKop), 0));
    var kopLineMaterial = new THREE.LineBasicMaterial({color: designKopLineColor});
    geometry = new THREE.BufferGeometry().setFromPoints(points);
    var kopLine = new THREE.Line(geometry, kopLineMaterial);
    designDrillLines.add(kopLine);
  }
  // 靶圈的投影
  if (designTargetPoints.length > 0) {
    var targetCircleMaterial = new THREE.LineBasicMaterial({color: designTargetCircleColor});
    designTargetPoints.forEach(function(p, i) {
      var points = [];
      points.push(new THREE.Vector3(hDesignTargets[i] - p.r, depthToY(p.depth), 0));
      points.push(new THREE.Vector3(hDesignTargets[i] + p.r, depthToY(p.depth), 0));
      geometry = new THREE.BufferGeometry().setFromPoints(points);
      var targetCircle = new THREE.Line(geometry, targetCircleMaterial);
      designDrillLines.add(targetCircle);
    });
  }
  scene.add(designDrillLines);

  var textMaterial = new THREE.MeshBasicMaterial({color: fontColor});
  var fontSize = gridUnit * fontSizeToUnitRatio;
  var fontHeight = gridUnit / 20;
  useFont(function (font) {
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
      var text = yToDepth(fAdd(vRange.min, fMul(gridUnit, i))).toString();
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
  // 方向箭头
  // 绘制三条边以上的多边形时要用下面的方式
  var arrowMaterial = new THREE.MeshBasicMaterial({color: directionLabelColor, side: THREE.DoubleSide});
  var arrowWidth = gridUnit / 2, arrowHeight = gridUnit / 3;
  var startX = hRange.max + gridUnit / 3, startY = vRange.max - gridUnit / 2 + arrowHeight / 2;
  var shape = new THREE.Shape();
  shape.moveTo(startX, startY);
  shape.lineTo(startX + arrowWidth / 4,startY - arrowHeight / 2);
  shape.lineTo(startX, startY - arrowHeight);
  shape.lineTo(startX + arrowWidth, startY - arrowHeight / 2);
  shape.lineTo(startX, startY);
  geometry = new THREE.ShapeGeometry(shape);
  var arrow = new THREE.Mesh(geometry, arrowMaterial);
  scene.add(arrow);
  useFont(function (font) {
    // 方向标识
    var text = directionTxt;
    var textGeometry = new THREE.TextGeometry(text, {
      font: font,
      size: fontSize,
      height: fontHeight
    });
    var mesh = new THREE.Mesh(textGeometry, textMaterial);
    var box = new THREE.Box3().setFromObject(mesh)
    mesh.position.x = startX + arrowWidth / 2 - (box.max.x - box.min.x) / 2;
    mesh.position.y = startY - arrowHeight - fontSize * 1.5;
    mesh.position.z = -fontHeight / 2;
    scene.add(mesh);
  });
  var graphObj = new CanvasGraph({
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
  canvas.style.display = "none";
}

var canvasId, config, hRealTargetPoints, hRealTrackPoints, hDesignTargetPoints, hDesignTrackPoints, directionText;
function initVerticalProjectionEW() {
  canvasId = 'verticalProjectionEW';
  config = configObj && configObj.verticalProjectionEW;
  hRealTargetPoints = realTargetPoints.map(function(p) {return p.x}); // 靶点的横轴坐标
  hDesignTargetPoints = designTargetPoints.map(function(p) {return p.x}); // 靶点的横轴坐标
  hRealTrackPoints = realXs; // 轨迹点的横轴坐标
  hDesignTrackPoints = designXs; // 轨迹点的横轴坐标
  directionText = "E";
  // 上面赋值的变量需要在画图的函数中用到
  initVerticalProjection();
}

function initVerticalProjectionNS() {
  canvasId = 'verticalProjectionNS';
  config = configObj && configObj.verticalProjectionNS;
  hRealTargetPoints = realTargetPoints.map(function(p) {return p.y}); // 靶点的横轴坐标
  hDesignTargetPoints = designTargetPoints.map(function(p) {return p.y}); // 靶点的横轴坐标
  hRealTrackPoints = realYs; // 轨迹点的横轴坐标
  hDesignTrackPoints = designYs; // 轨迹点的横轴坐标
  directionText = "N";
  initVerticalProjection();
}

// 画图完成后需要完成的动作
function postDrawFinished() {
  // 隐藏加载中提示
  if (loading) {
    loading.style.display = "none";
  }
}

// 页面初始化时出现异常,提示用户并抛出异常
function triggerInitError(text) {
  if (loading) {
    loading.innerText = text;
    loading.style.color = "red";
  }
  throw Error(text);
}

function setWellName(name) {
  var wellNameDom = document.getElementById('well-name-text');
  if (wellNameDom) {
    wellNameDom.innerText = name;
  }
}

// 主函数
function init() {
  loadConfigFile(configPath)
      .then(function () {
        fetchWellNameByNO(initWellNO).then(function (text) {
          setWellName(text);
        });
        return Promise.all([fetchRealTrackPoints(initWellNO),
          fetchRealTargetPoints(initWellNO),
          fetchDesignTrackPoints(initWellNO),
          fetchDesignTargetPoints(initWellNO)]);
      }).then(dataProcess)
      .then(initGraph);
}

function initGraph() {
  var graphType = configObj.defaultGraphType || defaultGraphType;
  if (urlParams.graphType) {
    graphType = urlParams.graphType;
  }
  switchGraph(graphType); // 切换到默认的图
  postDrawFinished();
}

// 在不同的图之间切换
function switchGraph(graphType) {
  curGraph && curGraph.hide();
  var candidate, wellTypeText;
  if (graphType === "verticalProjectionEW") {
    wellTypeText = "垂直剖面投影图(东西)";
    if (!verticalProjectionEW) {
      initVerticalProjectionEW();
    }
    candidate = verticalProjectionEW;
  } else if (graphType === "verticalProjectionNS") {
    wellTypeText = "垂直剖面投影图(南北)";
    if (!verticalProjectionNS) {
      initVerticalProjectionNS();
    }
    candidate = verticalProjectionNS;
  } else if (graphType === "horizontalProjection") {
    wellTypeText = "水平位移投影图";
    if (!horizontalProjection) {
      initHorizontalProjection();
    }
    candidate = horizontalProjection;
  } else { // spatialTrack
    wellTypeText = "立体空间轨迹图";
    if (!spatialTrack) {
      initSpatialTrack();
    }
    candidate = spatialTrack;
  }
  curGraph = candidate;
  curGraph.show();
  // 设置图类型单选框的选中状态
  var radio = document.querySelector("#type-select-area input[value=" + graphType + "]");
  radio.checked = true;
  // 设置钻线选择类型的复选框的选中状态
  var realVisible = curGraph.getRealDrillingLineVisible();
  var designVisible = curGraph.getDesignDrillingLineVisible();
  var realLineCheck = document.getElementById("check-real-line");
  realLineCheck.checked = realVisible;
  var designLineCheck = document.getElementById("check-design-line");
  designLineCheck.checked = designVisible;
  // 设置页面底部井的名称和类型
  var bannerText = document.getElementById('well-name-banner-text');
  bannerText && (bannerText.innerText = wellTypeText);
}

// 计算一些必要的变量
function dataProcess() {
  return new Promise(function (resolve) {
    realXs = realTrackPoints.map(function (p) { return p.x });
    designXs = designTrackPoints.map(function (p) { return p.x });
    realYs = realTrackPoints.map(function (p) { return p.y });
    designYs = designTrackPoints.map(function (p) { return p.y });
    if (realXs.length === 0 && designXs.length === 0 && realYs.length === 0 && designYs.length === 0) {
      triggerInitError("此图无数据!");
    }
    allXs = realXs.concat(designXs);
    allYs = realYs.concat(designYs);
    // 实钻线的深度数据
    realDepths = realTrackPoints.map(function (p) { return p.depth });
    // 设计钻线的深度数据
    designDepths = designTrackPoints.map(function (p) { return p.depth });
    // xy坐标平面大小
    // x,y坐标中绝对值最大的数
    xyFarthest = Math.max(Math.abs(Math.max.apply(null, allXs)), Math.abs(Math.min.apply(null, allXs)),
        Math.abs(Math.max.apply(null, allYs)), Math.abs(Math.min.apply(null, allYs)));
    resolve();
  });
}

//// api相关函数
// 加载配置文件
function loadConfigFile(configPath) {
  return new Promise(function (resolve) {
    axios.get(configPath, {
      transformResponse: function (data) {
        try {
          var d = JSON5.parse(data);
        } catch (e) {
          console.error("配置对象不是一个有效的对象!");
        }
        return d;
      }
    }).then(function (res) {
      configObj = res.data;
      externalDataTransceiver = new axios.create({
        baseURL: configObj.externalDataBasePath
      });
      if (configObj.defaultTargetRadius && configObj.defaultTargetRadius >= 0) {
        defaultTargetRadius = configObj.defaultTargetRadius;
      }
      if (configObj.defaultWellNO && !urlParams.wellNO) {
        initWellNO = configObj.defaultWellNO;
      }
      resolve();
    }).catch(function (err) {
      console.error("配置文件加载失败,请检查配置文件的位置!");
    });
  });
}

// 获取实际钻靶点数据
function fetchRealTargetPoints(wellNO) {
  return new Promise(function (resolve) {
    externalDataTransceiver.get("/api/jxjs/getBd", {
      params: {jhdm: wellNO}
    }).then(function (res) {
      try {
        realTargetPoints = res.data;
      } catch (e) {
        triggerInitError("靶点数据不是一个有效的对象!");
      }
      realTargetPoints = parseTargetPointsData(realTargetPoints);
      resolve();
    }).catch(function () {
      triggerInitError("靶点数据加载失败!");
    });
  });
}

// 获取实钻靶点数据
function fetchDesignTargetPoints(wellNO) {
  return new Promise(function (resolve) {
    externalDataTransceiver.get("/api/jxjs/getSjBd", {
      params: {jhdm: wellNO}
    }).then(function (res) {
      try {
        designTargetPoints = res.data;
      } catch (e) {
        triggerInitError("设计靶点数据不是一个有效的对象!");
      }
      designTargetPoints = parseTargetPointsData(designTargetPoints);
      resolve();
    }).catch(function () {
      triggerInitError("设计靶点数据加载失败!");
    });
  });
}

// 获取实钻的轨迹点数据
function fetchRealTrackPoints(wellNO) {
  return new Promise(function (resolve) {
    externalDataTransceiver.get("api/jxjs/getLxAll",{
      params: {jhdm: wellNO}
    }).then(function (res) {
      try {
        realTrackPoints = res.data;
      } catch (e) {
        triggerInitError("实钻轨迹点数据不是一个有效的对象!");
      }
      // 设置造斜点
      if (realTrackPoints[0] && realTrackPoints[0].zxd) {
        realKop = parseFloat(realTrackPoints[0].zxd);
      }
      realTrackPoints = parseTrackPointsData(realTrackPoints);
      resolve();
    }).catch(function () {
      triggerInitError("加载实钻轨迹点数据失败!");
    });
  });
}

// 获取设计钻井钻的轨迹点数据
function fetchDesignTrackPoints(wellNO) {
  return new Promise(function (resolve) {
    externalDataTransceiver.get("/api/jxjs/getSjAll",{
      params: {jhdm: wellNO}
    }).then(function (res) {
      try {
        designTrackPoints = res.data;
      } catch (e) {
        triggerInitError("设计钻线轨迹点数据不是一个有效的对象!");
      }
      // 设置造斜点
      if (designTrackPoints[0] && designTrackPoints[0].zxd) {
        designKop = parseFloat(designTrackPoints[0].zxd);
      }
      designTrackPoints = parseTrackPointsData(designTrackPoints);
      resolve();
    }).catch(function () {
      triggerInitError("加载设计钻线轨迹点数据失败!");
    });
  });
}

// 根据井名的前缀获取所有以它开头的井的井号
function fetchWellNOByPrefix(prefix) {
  return new Promise(function (resolve) {
    externalDataTransceiver.get('/api/jxjs/getJh', {
      params: {jhdm: prefix}
    }).then(function (res) {
      resolve(res.data);
    }).catch(function (err) {
      console.error("无法获取井号数据!");
    });
  });
}

function fetchWellNameByNO(no) {
  return new Promise(function (resolve) {
    externalDataTransceiver.get('/api/jxjs/getJhbm', {
      params: {jhdm: no}
    }).then(function (res) {
      wellName = res.data.length > 0 ? res.data[0].jhbm : "";
      resolve(wellName);
    }).catch(function (err) {
      console.error("无法获取井号数据!");
    });
  });
}

// 构建井名的下拉菜单
function buildWellNameSelectDropdown(data) {
  var html = '<div class="dropdown is-active">';
  html += '  <div class="dropdown-menu" role="menu">';
  html += '    <div class="dropdown-content">';
  html += data.map(function (w) {
    var h = '<div class="dropdown-item" data-wellno=';
    h += w.jhdm + '>' + w.jhbm + '</div>';
    return h;
  }).join("");
  html += '</div></div></div>'
  return html;
}

// 解析靶点数据
function parseTargetPointsData(points) {
  var invalidNum = 0;
  points = points.map(function (p) {
    return {
      y: (p.xzb - p.jkzzbx),
      x: (p.yzb - p.jkhzby),
      depth: p.csb,
      r: p.ybbqbj === null ? defaultTargetRadius : p.ybbqbj // 如果没有靶半径则设置一个默认的靶半径
    }
  }).filter(function (p) {
    if (isNaN(p.x) || isNaN(p.y) || isNaN(p.depth)) {
      invalidNum++;
      return false;
    }
    return true;
  });
  if (invalidNum) {
    console.warn("无效靶点数据:" + invalidNum + "条");
  }
  return points;
}

// 解析轨迹点数据
function parseTrackPointsData(points) {
  var invalidNum = 0;
  points = points.map(function (p) {
    return {
      x: parseFloat(p.dxpy),
      y: parseFloat(p.nbpy),
      depth: parseFloat(p.cs)
    }
  }).filter(function (p) {
    if (isNaN(p.x) || isNaN(p.y) || isNaN(p.depth)) {
      invalidNum++;
      return false;
    }
    return true;
  });
  if (invalidNum) {
    console.warn("无效轨迹点数据:" + invalidNum + "条");
  }
  return points;
}

function eventListen() {
  // 展开和收起页头的菜单
  var headBurger = document.getElementById('head-burger');
  var headMenu = document.getElementById("head-menu");
  headBurger.addEventListener("click", function () {
    headBurger.classList.toggle("is-active");
    headMenu.classList.toggle("is-active");
  });
  // 选择不同的图
  var selects = document.getElementsByName("typeSel");
  for (var i = 0; i < selects.length; i++) {
    selects[i].addEventListener("change", function () {
      switchGraph(this.value);
      headMenu.classList.toggle('is-active');
      headBurger.classList.toggle('is-active');
    });
  }
  var resetBtn = document.getElementById("reset-btn");
  resetBtn && resetBtn.addEventListener("click", function () {
    if (curGraph) {
      curGraph.reset();
    }
  });
  // 将图导出为图片
  var exportBtn = document.getElementById("export-btn");
  exportBtn && exportBtn.addEventListener("click", function () {
    if (curGraph) {
      curGraph.export();
    }
  });
  // 切换实钻线和设计钻线
  var selectLineType = document.querySelectorAll("#select-line-type input[type='checkbox']");
  for (var i = 0; i < selectLineType.length; i++) {
    selectLineType[i].addEventListener("change", function () {
      if (this.id === "check-design-line") {
        // 不允许两个按钮都关闭
        if (!curGraph.getRealDrillingLineVisible() && !this.checked) {
          this.checked = true;
          return;
        }
        curGraph.setDesignDrillingLine(this.checked);
      } else if (this.id === "check-real-line") {
        // 不允许两个按钮都关闭
        if (!curGraph.getDesignDrillingLineVisible() && !this.checked) {
          this.checked = true;
          return;
        }
        curGraph.setRealDrillingLine(this.checked);
      }
      headMenu.classList.toggle('is-active');
      headBurger.classList.toggle('is-active');
    });
  }
  // 输入井名的输入框
  var wellNameInput = document.getElementById("well-name-input");
  var dropdown = document.getElementById("well-name-dropdown");
  var imeInputting = false; // 是否正在使用输入法输入非英文字符
  wellNameInput.addEventListener("compositionend", function () {
    imeInputting = false;
  });
  wellNameInput.addEventListener("compositionstart", function () {
    imeInputting = true;
  });
  wellNameInput.addEventListener("keyup",debounce(function () {
    if (imeInputting) return; // 如果是正在输入中文,则不操作
    if (wellNameInput.value === "") { // 输入框被清空,清空下拉菜单
      dropdown.innerHTML = "";
      return;
    }
    fetchWellNOAndBuildDropdown(this.value);
  }, 250)); // 防抖,以免频繁的向后端发送请求,执行n毫秒内触发的最后一次动作
  // 点击输入框,获取最近访问的井
  wellNameInput.addEventListener("focus", function (e) {
    if (this.value !== "") return;
    fetchWellNOAndBuildDropdown(this.value);
  });
  document.addEventListener("pointerdown", hideWellNameDropdown);
  document.addEventListener("touchstart", hideWellNameDropdown);
  function hideWellNameDropdown(e) {
    wellNameInput.blur();
    // 点击空白区域清除井名菜单
    var target = e.target || e.srcElement;
    while (target) {
      if (target === dropdown) {
        return;
      }
      target = target.parentNode;
    }
    dropdown.innerHTML = "";
  }
  function fetchWellNOAndBuildDropdown(name) {
    fetchWellNOByPrefix(name).then(function (data) {
      if (data.length === 0) {
        dropdown.innerHTML = "";
        return;
      }
      dropdown.innerHTML = buildWellNameSelectDropdown(data);
      var wells = dropdown.getElementsByClassName("dropdown-item");
      for (var i = 0; i < wells.length; i++) {
        var well = wells[i];
        well.addEventListener("click", function () {
          var wellNO = this.dataset["wellno"];
          // 构建相应井名对应的url并跳转
          var path = location.origin + location.pathname + '?' + 'wellNO=' + wellNO;
          location.assign(path);
        });
      }
    });
  }
}

function CanvasGraph(config) {
  var controls = config.controls;
  var renderer = config.renderer;
  var scene = config.scene;
  var camera = config.camera;
  var canvas = null;
  if (!renderer) {
    throw Error("没有渲染器参数!");
  }
  if (!camera) {
    throw Error("没有相机参数!");
  }
  if (!scene) {
    throw Error("没有场景参数!");
  }
  canvas = renderer.domElement;
  this.canvas = canvas;
  if (controls) {
    // 只有图形更新时才重绘
    controls.addEventListener("change", draw);
    animate();
  } else {
    // 不需要每帧都绘制,完全不更新的图形
    draw();
  }
  window.addEventListener("resize", windowResize);

  this.show = function () {
    if (canvas && canvas.style) {
      canvas.style.display = "";
      windowResize();
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
      if (window.navigator.msSaveOrOpenBlob) { // ie
        var imgData = canvas.msToBlob();
        var blob = new Blob([imgData]);
        window.navigator.msSaveOrOpenBlob(blob, "canvas.png");
      } else {
        var link = document.createElement("a");
        link.download = "canvas.png";
        link.href = canvas.toDataURL();
        link.click();
        link.remove();
      }
    }
  }

  // 获取实钻线的显示状态
  this.getRealDrillingLineVisible = function () {
    var realDrillLine = scene.getObjectByName("realDrillLines");
    return realDrillLine && realDrillLine.visible;
  }

  this.getDesignDrillingLineVisible = function () {
    var designDrillLine = scene.getObjectByName("designDrillLines");
    return designDrillLine && designDrillLine.visible;
  }

  // 设置实钻线的显示状态
  this.setRealDrillingLine = function (state) {
    var realDrillLine = scene.getObjectByName("realDrillLines");
    if (realDrillLine && typeof state === "boolean") {
      realDrillLine.visible = state;
      draw();
    }
  }

  this.setDesignDrillingLine = function (state) {
    var designDrillLine = scene.getObjectByName("designDrillLines");
    if (designDrillLine && typeof state === "boolean") {
      designDrillLine.visible = state;
      draw();
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
  }

  // 绘制图形
  function draw() {
    renderer.render(scene, camera);
  }

  function windowResize() {
    // 避免在隐藏时绘制,隐藏时无法得到画布的宽高
    if (canvas.style.display !== "none") {
      var width = canvas.offsetWidth, height = canvas.offsetHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      draw();
    }
  }
}

//// 工具函数
function debounce(func, wait) {
  var timeout;
  return function () {
    var context = this;
    var args = arguments;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(function() {
      func.apply(context, args)
    }, wait);
  }
}

// 解析url的参数为一个对象
function parseUrlParam(url) {
  var params = {}, h;
  var hash = url.slice(url.indexOf("?") + 1).split('&');
  for (var i = 0; i < hash.length; i++) {
    h = hash[i].split("=");
    params[h[0]] = h[1];
  }
  return params;
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

/**
 * 根据显示物体的宽高和画布宽高确定摄像机在多高时,能正好把物体完整显示在画布上
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

// js中的浮点数运算存在误差,必要时使用下面的函数替代
// 浮点数乘法
function fMul(a, b) {
  var m, n, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, m + n); //将数字转换为整数的最大倍数
  return Number(d.replace(".", "")) * Number(e.replace(".", "")) / maxInt;
}

// 浮点数加法
function fAdd(a, b) {
  var m, n, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, Math.max(m, n)); //将数字转换为整数的最大倍数
  return (fMul(a, maxInt) + fMul(b, maxInt)) / maxInt;
}

// 浮点数减法
function fSub(a, b) {
  var m, n, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, Math.max(m, n)); //将数字转换为整数的最大倍数
  return (fMul(a, maxInt) - fMul(b, maxInt)) / maxInt;
}

// 浮点数除法
function fDivision(a, b) {
  var m, n, d = a + "", e = b + "";
  m = d.split(".")[1] ? d.split(".")[1].length : 0;
  n = e.split(".")[1] ? e.split(".")[1].length : 0;
  var maxInt = Math.pow(10, Math.max(n, m)); //将数字转换为整数的最大倍数
  var aInt = fMul(a, maxInt);
  var bInt = fMul(b, maxInt);
  return aInt / bInt;
}
