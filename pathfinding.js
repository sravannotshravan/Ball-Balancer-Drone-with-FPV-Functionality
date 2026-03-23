function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function cellKey(ix, iz) {
    return `${ix},${iz}`;
}

export class NavigationGrid {
    constructor(minX, maxX, minZ, maxZ, cellSize = 2) {
        this.minX = minX;
        this.maxX = maxX;
        this.minZ = minZ;
        this.maxZ = maxZ;
        this.cellSize = cellSize;
        this.width = Math.max(1, Math.round((maxX - minX) / cellSize) + 1);
        this.height = Math.max(1, Math.round((maxZ - minZ) / cellSize) + 1);
        this.walkable = new Uint8Array(this.width * this.height);
        this.walkable.fill(1);
    }

    reset() {
        this.walkable.fill(1);
    }

    isInsideIndex(ix, iz) {
        return ix >= 0 && ix < this.width && iz >= 0 && iz < this.height;
    }

    index(ix, iz) {
        return iz * this.width + ix;
    }

    worldToGrid(x, z) {
        const ix = Math.round((x - this.minX) / this.cellSize);
        const iz = Math.round((z - this.minZ) / this.cellSize);
        return {
            ix: clamp(ix, 0, this.width - 1),
            iz: clamp(iz, 0, this.height - 1),
        };
    }

    gridToWorld(ix, iz) {
        return {
            x: this.minX + ix * this.cellSize,
            z: this.minZ + iz * this.cellSize,
        };
    }

    isWalkableIndex(ix, iz) {
        return this.isInsideIndex(ix, iz) && this.walkable[this.index(ix, iz)] === 1;
    }

    markObstacles(colliders = [], padding = 0) {
        this.reset();

        for (let colliderIndex = 0; colliderIndex < colliders.length; colliderIndex += 1) {
            const collider = colliders[colliderIndex];
            if (!collider) {
                continue;
            }

            const min = this.worldToGrid(
                collider.x - (collider.hx ?? 0) - padding,
                collider.z - (collider.hz ?? 0) - padding
            );
            const max = this.worldToGrid(
                collider.x + (collider.hx ?? 0) + padding,
                collider.z + (collider.hz ?? 0) + padding
            );

            for (let iz = min.iz; iz <= max.iz; iz += 1) {
                for (let ix = min.ix; ix <= max.ix; ix += 1) {
                    if (!this.isInsideIndex(ix, iz)) {
                        continue;
                    }
                    this.walkable[this.index(ix, iz)] = 0;
                }
            }
        }
    }

    isPointWalkable(x, z) {
        if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) {
            return false;
        }

        const { ix, iz } = this.worldToGrid(x, z);
        return this.isWalkableIndex(ix, iz);
    }

    findNearestWalkable(x, z, maxRadius = 10) {
        const start = this.worldToGrid(x, z);
        if (this.isWalkableIndex(start.ix, start.iz)) {
            return start;
        }

        for (let radius = 1; radius <= maxRadius; radius += 1) {
            for (let dz = -radius; dz <= radius; dz += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) {
                        continue;
                    }
                    const ix = start.ix + dx;
                    const iz = start.iz + dz;
                    if (this.isWalkableIndex(ix, iz)) {
                        return { ix, iz };
                    }
                }
            }
        }

        return null;
    }

    hasLineOfSight(start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const distance = Math.hypot(dx, dz);

        if (distance < 1e-5) {
            return this.isPointWalkable(start.x, start.z);
        }

        const steps = Math.max(1, Math.ceil(distance / Math.max(0.4, this.cellSize * 0.45)));
        for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            const sampleX = start.x + dx * t;
            const sampleZ = start.z + dz * t;
            if (!this.isPointWalkable(sampleX, sampleZ)) {
                return false;
            }
        }

        return true;
    }

    reconstructPath(cameFrom, endKey) {
        const cells = [];
        let currentKey = endKey;

        while (currentKey) {
            const [ixText, izText] = currentKey.split(',');
            cells.push({ ix: Number(ixText), iz: Number(izText) });
            currentKey = cameFrom.get(currentKey) ?? null;
        }

        cells.reverse();
        return cells;
    }

    smoothPath(points) {
        if (points.length <= 2) {
            return points.slice();
        }

        const smoothed = [points[0]];
        let anchorIndex = 0;

        while (anchorIndex < points.length - 1) {
            let furthestVisible = anchorIndex + 1;
            for (let testIndex = points.length - 1; testIndex > anchorIndex + 1; testIndex -= 1) {
                if (this.hasLineOfSight(points[anchorIndex], points[testIndex])) {
                    furthestVisible = testIndex;
                    break;
                }
            }

            smoothed.push(points[furthestVisible]);
            anchorIndex = furthestVisible;
        }

        return smoothed;
    }

    findPath(startX, startZ, endX, endZ) {
        const start = this.findNearestWalkable(startX, startZ, 12);
        const end = this.findNearestWalkable(endX, endZ, 12);

        if (!start || !end) {
            return [];
        }

        const startKey = cellKey(start.ix, start.iz);
        const endKey = cellKey(end.ix, end.iz);
        const open = [start];
        const openSet = new Set([startKey]);
        const cameFrom = new Map();
        const gScore = new Map([[startKey, 0]]);
        const fScore = new Map([[startKey, Math.hypot(end.ix - start.ix, end.iz - start.iz)]]);
        const neighbors = [
            { dx: -1, dz: 0, cost: 1 },
            { dx: 1, dz: 0, cost: 1 },
            { dx: 0, dz: -1, cost: 1 },
            { dx: 0, dz: 1, cost: 1 },
            { dx: -1, dz: -1, cost: Math.SQRT2 },
            { dx: 1, dz: -1, cost: Math.SQRT2 },
            { dx: -1, dz: 1, cost: Math.SQRT2 },
            { dx: 1, dz: 1, cost: Math.SQRT2 },
        ];

        while (open.length > 0) {
            let currentIndex = 0;
            let currentKey = cellKey(open[0].ix, open[0].iz);
            let currentScore = fScore.get(currentKey) ?? Infinity;

            for (let index = 1; index < open.length; index += 1) {
                const candidate = open[index];
                const candidateKey = cellKey(candidate.ix, candidate.iz);
                const candidateScore = fScore.get(candidateKey) ?? Infinity;
                if (candidateScore < currentScore) {
                    currentIndex = index;
                    currentKey = candidateKey;
                    currentScore = candidateScore;
                }
            }

            const current = open.splice(currentIndex, 1)[0];
            openSet.delete(currentKey);

            if (currentKey === endKey) {
                const cellPath = this.reconstructPath(cameFrom, endKey);
                const pointPath = cellPath.map(cell => this.gridToWorld(cell.ix, cell.iz));
                pointPath[0] = { x: startX, z: startZ };
                pointPath[pointPath.length - 1] = { x: endX, z: endZ };
                return this.smoothPath(pointPath);
            }

            const currentG = gScore.get(currentKey) ?? Infinity;
            for (let neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex += 1) {
                const neighbor = neighbors[neighborIndex];
                const nextIx = current.ix + neighbor.dx;
                const nextIz = current.iz + neighbor.dz;

                if (!this.isWalkableIndex(nextIx, nextIz)) {
                    continue;
                }

                if (neighbor.dx !== 0 && neighbor.dz !== 0) {
                    const sideAFree = this.isWalkableIndex(current.ix + neighbor.dx, current.iz);
                    const sideBFree = this.isWalkableIndex(current.ix, current.iz + neighbor.dz);
                    if (!sideAFree || !sideBFree) {
                        continue;
                    }
                }

                const nextKey = cellKey(nextIx, nextIz);
                const tentativeG = currentG + neighbor.cost;
                if (tentativeG >= (gScore.get(nextKey) ?? Infinity)) {
                    continue;
                }

                cameFrom.set(nextKey, currentKey);
                gScore.set(nextKey, tentativeG);
                fScore.set(nextKey, tentativeG + Math.hypot(end.ix - nextIx, end.iz - nextIz));

                if (!openSet.has(nextKey)) {
                    open.push({ ix: nextIx, iz: nextIz });
                    openSet.add(nextKey);
                }
            }
        }

        return [];
    }
}
