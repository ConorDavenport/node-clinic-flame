'use strict'

class DataTree {
  constructor (tree) {
    this.merged = tree.merged
    this.unmerged = tree.unmerged

    // Set a reasonable upper limit to displayed name; exact name matching is done in analysis
    this.appName = tree.appName.length > 30 ? tree.appName.slice(0, 30) + '…' : tree.appName
    this.pathSeparator = tree.pathSeparator

    this.useMerged = false
    this.showOptimizationStatus = false
    this.exclude = new Set(['cpp', 'regexp', 'v8', 'native', 'init'])

    this.flatByHottest = null // Set after d3-fg sets .hide on frames. TODO: bring this forward
  }

  show (name) {
    if (this.exclude.has(name)) {
      this.exclude.delete(name)
      return true
    }
    return false
  }

  hide (name) {
    if (!this.exclude.has(name)) {
      this.exclude.add(name)
      return true
    }
    return false
  }

  sortFramesByHottest () {
    // Flattened tree, sorted hottest first, excluding the 'all stacks' root node
    this.flatByHottest = this.getFlattenedSorted(this.getStackTopSorter())
  }

  activeTree () {
    return this.useMerged ? this.merged : this.unmerged
  }

  setActiveTree (useMerged = false) {
    this.useMerged = useMerged === true
    this.sortFramesByHottest()
  }

  getFlattenedSorted (sorter) {
    const arr = getFlatArray(this.activeTree().children)
    const filtered = arr.filter(node => !node.hide)
    return filtered.sort(sorter)
  }

  getHighestStackTop (tree = this.activeTree()) {
    if (this.flatByHottest) return this.getStackTop(this.flatByHottest[0])

    return tree.children
      ? tree.children.reduce((highest, child) => {
        const newValue = this.getHighestStackTop(child)
        return newValue > highest ? newValue : highest
      }, this.getStackTop(tree))
      : 0
  }

  getFrameByRank (rank, arr = this.flatByHottest) {
    if (!arr) return null
    return arr[rank] || null
  }

  getStackTop (frame) {
    let stackTop = frame.stackTop.base
    this.exclude.forEach((excluded) => {
      stackTop += frame.stackTop[excluded]
    })
    return stackTop
  }

  getStackTopSorter () {
    return (nodeA, nodeB) => {
      const topA = this.getStackTop(nodeA)
      const topB = this.getStackTop(nodeB)

      // Sort highest first, treating equal as equal
      return topA === topB ? 0 : topA > topB ? -1 : 1
    }
  }

  getSortPosition (node, arr = this.flatByHottest) {
    return arr.indexOf(node)
  }

  countFrames (arr = this.flatByHottest) {
    return arr.length
  }
}

function getFlatArray (children) {
  // Flatten the tree, excluding the root node itself (i.e. the 'all stacks' node)
  return [...children].concat(children.reduce((arr, child) => {
    if (child.children) return arr.concat(getFlatArray(child.children))
  }, []))
}

module.exports = DataTree
