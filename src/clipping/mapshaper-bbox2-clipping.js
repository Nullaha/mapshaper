
internal.clipLayersByBBox = function(layers, dataset, opts) {
  var bbox = opts.bbox2;
  var clipLyr = internal.divideDatasetByBBox(dataset, bbox);
  var nodes = new NodeCollection(dataset.arcs);
  var retn = internal.clipLayersByLayer(dataset.layers, clipLyr, nodes, 'clip', opts);
  return retn;
};

// Insert cutting points in arcs, where bbox intersects other shapes
// Return a polygon layer containing the bounding box vectors, divided at cutting points.
internal.divideDatasetByBBox = function(dataset, bbox) {
  var arcs = dataset.arcs;
  var data = internal.findBBoxCutPoints(arcs, bbox);
  var map = internal.insertCutPoints(data.cutPoints, arcs);
  arcs.dedupCoords();
  internal.remapDividedArcs(dataset, map);
  // merge bbox dataset with target dataset,
  // so arcs are shared between target layers and bbox layer
  var clipDataset = internal.bboxPointsToClipDataset(data.bboxPoints);
  var mergedDataset = internal.mergeDatasets([dataset, clipDataset]);
  // TODO: detect if we need to rebuild topology (unlikely), like with the full clip command
  // api.buildTopology(mergedDataset);
  var clipLyr = mergedDataset.layers.pop();
  dataset.arcs = mergedDataset.arcs;
  dataset.layers = mergedDataset.layers;
  return clipLyr;
};

internal.bboxPointsToClipDataset = function(arr) {
  var arcs = [];
  var shape = [];
  var layer = {geometry_type: 'polygon', shapes: [[shape]]};
  var p1, p2;
  for (var i=0, n=arr.length - 1; i<n; i++) {
    p1 = arr[i];
    p2 = arr[i+1];
    arcs.push([[p1.x, p1.y], [p2.x, p2.y]]);
    shape.push(i);
  }
  return {
    arcs: new ArcCollection(arcs),
    layers: [layer]
  };
};

internal.findBBoxCutPoints = function(arcs, bbox) {
  var left = bbox[0],
      bottom = bbox[1],
      right = bbox[2],
      top = bbox[3];

  // arrays of intersection points along each bbox edge
  var tt = [],
      rr = [],
      bb = [],
      ll = [];

  arcs.forEachSegment(function(i, j, xx, yy) {
    var ax = xx[i],
        ay = yy[i],
        bx = xx[j],
        by = yy[j];
    var hit;
    if (internal.segmentOutsideBBox(ax, ay, bx, by, left, bottom, right, top)) return;
    if (internal.segmentInsideBBox(ax, ay, bx, by, left, bottom, right, top)) return;

    hit = geom.segmentIntersection(left, top, right, top, ax, ay, bx, by);
    if (hit) addHit(tt, hit, i, j, xx, yy);

    hit = geom.segmentIntersection(left, bottom, right, bottom, ax, ay, bx, by);
    if (hit) addHit(bb, hit, i, j, xx, yy);

    hit = geom.segmentIntersection(left, bottom, left, top, ax, ay, bx, by);
    if (hit) addHit(ll, hit, i, j, xx, yy);

    hit = geom.segmentIntersection(right, bottom, right, top, ax, ay, bx, by);
    if (hit) addHit(rr, hit, i, j, xx, yy);
  });

  return {
    cutPoints: ll.concat(bb, rr, tt),
    bboxPoints: internal.getDividedBBoxPoints(bbox, ll, tt, rr, bb)
  };

  function addHit(arr, hit, i, j, xx, yy) {
    if (!hit) return;
    arr.push(formatHit(hit[0], hit[1], i, j, xx, yy));
    if (hit.length == 4) {
      arr.push(formatHit(hit[2], hit[3], i, j, xx, yy));
    }
  }

  function formatHit(x, y, i, j, xx, yy) {
    var ids = internal.formatIntersectingSegment(x, y, i, j, xx, yy);
    return internal.getCutPoint(x, y, ids[0], ids[1], xx, yy);
  }
};

internal.segmentOutsideBBox = function(ax, ay, bx, by, xmin, ymin, xmax, ymax) {
  return ax < xmin && bx < xmin || ax > xmax && bx > xmax ||
      ay < ymin && by < ymin || ay > ymax && by > ymax;
};

internal.segmentInsideBBox = function(ax, ay, bx, by, xmin, ymin, xmax, ymax) {
  return ax > xmin && bx > xmin && ax < xmax && bx < xmax &&
      ay > ymin && by > ymin && ay < ymax && by < ymax;
};

// Returns an array of points representing the vertices in
// the bbox with cutting points inserted.
internal.getDividedBBoxPoints = function(bbox, ll, tt, rr, bb) {
  var bl = {x: bbox[0], y: bbox[1]},
      tl = {x: bbox[0], y: bbox[3]},
      tr = {x: bbox[2], y: bbox[3]},
      br = {x: bbox[2], y: bbox[1]};
  ll = utils.sortOn(ll.concat([bl, tl]), 'y', true);
  tt = utils.sortOn(tt.concat([tl, tr]), 'x', true);
  rr = utils.sortOn(rr.concat([tr, br]), 'y', false);
  bb = utils.sortOn(bb.concat([br, bl]), 'x', false);
  return ll.concat(tt, rr, bb).reduce(function(memo, p2) {
    var p1 = memo.length > 0 ? memo[memo.length-1] : null;
    if (p1 === null || p1.x != p2.x || p1.y != p2.y) memo.push(p2);
    return memo;
  }, []);
};
