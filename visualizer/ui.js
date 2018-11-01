'use strict'

const events = require('events')
const htmlContentTypes = require('./html-content-types.js')
const debounce = require('lodash.debounce')
const DataTree = require('./data-tree.js')

class Ui extends events.EventEmitter {
  constructor (wrapperSelector) {
    super()
    // TODO: Similar to 0x but condense hidden state like an octal
    // not json as number of excludables varies between samples
    // this.hashHistory = new HashHistory()

    this.dataTree = null
    this.highlightedNode = null
    this.selectedNode = null
    this.zoomedNode = null
    this.changedExclusions = {
      toHide: new Set(),
      toShow: new Set()
    }

    this.wrapperSelector = wrapperSelector
    this.exposedCSS = null
    this.setExposedCSS()

    this.sections = new Map()
    this.createContent()
  }

  /**
  * Handling user interactions
  **/
  optionsChange (optName, args) {
    switch (optName) {
      case 'merge':
        this.dataTree.setActiveTree(args)
        break

      default:
        break
    }

    this.emit(`option.${optName}`, args)
  }

  // Temporary e.g. on mouseover, erased on mouseout
  highlightNode (node = null) {
    const changed = node !== this.highlightedNode
    this.highlightedNode = node
    if (changed) this.emit('highlightNode', node)
  }

  // Persistent e.g. on click, then falls back to this after mouseout
  selectNode (node = null) {
    const changed = node !== this.selectedNode
    this.selectedNode = node
    if (changed) this.emit('selectNode', node)
  }

  zoomNode (node = this.highlightedNode) {
    const zoomingOut = !node || node === this.zoomedNode
    this.emit('zoomNode', zoomingOut ? null : node)
  }

  clearSearch () {
    const flameWrapper = this.uiContainer.content.get('flame-main')
    flameWrapper.clearSearch()
  }

  search (query) {
    if (!query) return

    const flameWrapper = this.uiContainer.content.get('flame-main')
    flameWrapper.search(query)
  }

  /**
  * Sections and content
  **/

  createContent () {
    this.mainElement = document.querySelector(this.wrapperSelector)

    this.uiContainer = new htmlContentTypes.HtmlContent(null, {
      element: this.mainElement,
      id: 'one-col-layout'
    }, this, this.wrapperSelector)

    // creating the tooltip instance that the Ui's components can share
    const tooltip = this.uiContainer.addContent('Tooltip', {
      htmlElementType: 'div',
      isHoverOverridden: true,
      id: 'ui-tooltip'
    })
    this.tooltip = tooltip

    const toolbarOuter = this.uiContainer.addContent(undefined, {
      id: 'toolbar-outer',
      htmlElementType: 'section'
      // TODO: will probably need to make this collapsible for portrait view
    })
    // TODO: add these ↴
    this.stackBar = toolbarOuter.addContent('StackBar', {
      id: 'stack-bar'
    })

    const toolbar = toolbarOuter.addContent('Toolbar', {
      id: 'toolbar',
      customTooltip: tooltip
    })

    const toolbarSidePanel = toolbar.addContent(undefined, {
      id: 'toolbar-side-panel',
      classNames: 'toolbar-section'
    })
    toolbarSidePanel.addContent('AreaKey', {
      id: 'area-key',
      classNames: 'panel'
    })
    toolbarSidePanel.addContent('SearchBox', {
      id: 'search-box',
      classNames: 'inline-panel'
    })
    toolbarSidePanel.addContent('OptionsMenu', {
      id: 'options-menu',
      classNames: 'inline-panel',
      customTooltip: tooltip
    })

    const flameWrapper = this.uiContainer.addContent('FlameGraph', {
      id: 'flame-main',
      htmlElementType: 'section',
      customTooltip: tooltip
    })
    this.flameWrapper = flameWrapper

    // TODO: add these ↴
    // flameWrapper.addContent('FlameGraph', { id: 'flame-zoomed' })
    // flameWrapper.addContent('HoverBox')
    // flameWrapper.addContent('IndicatorArrow')

    this.uiContainer.addContent(undefined, {
      id: 'footer',
      htmlElementType: 'section'
    })
    // TODO: add these ↴
    // footer.addContent('FlameGraph', { id: 'flame-chronological' })
    // footer.addContent('TimeFilter')

    let reDrawStackBar = debounce(() => this.stackBar.draw(this.highlightedNode), 200)

    let scrollElement = null
    const scrollChartIntoView = debounce(() => {
      if (!scrollElement) {
        scrollElement = flameWrapper.d3Element.select('.scroll-container').node()
      }

      scrollElement.scrollTo({
        top: scrollElement.scrollHeight,
        behavior: 'smooth'
      })
    }, 200)

    window.addEventListener('resize', () => {
      flameWrapper.resize()
      scrollChartIntoView()
      reDrawStackBar()
    })

    window.addEventListener('load', scrollChartIntoView)
  }

  addSection (id, options = {}) {
    options.id = id
    const section = this.uiContainer.addContent('HtmlContent', options)
    section.ui = this
    this.sections.set(id, section)
    return section
  }

  getContentClass (className) {
    const ContentClass = htmlContentTypes[className]
    if (typeof ContentClass !== 'function') {
      throw new Error(`HTML content class "${className}" is ${typeof ContentClass}`)
    }

    return ContentClass
  }

  getLabelFromKey (key, singular = false) {
    const keysToLabels = {
      'app': 'profiled application',
      'deps': singular ? 'dependency' : 'dependencies',
      'all-core': 'core',

      'core': 'Node JS',
      'native': 'V8 native JS',
      'v8': 'V8 runtime',
      'cpp': 'V8 C++',
      'regexp': 'RegExp',
      'init': 'initialization'
    }
    return keysToLabels[key] || key
  }

  setCodeAreaVisibility (name, visible) {
    let isChanged = false

    if (visible) {
      isChanged = this.dataTree.show(name)
      if (isChanged) this.changedExclusions.toShow.add(name)
    } else {
      isChanged = this.dataTree.hide(name)
      if (isChanged) this.changedExclusions.toHide.add(name)
    }

    if (isChanged) this.updateExclusions()
  }

  updateExclusions () {
    this.emit('updateExclusions')
  }

  setData (dataTree) {
    this.dataTree = new DataTree(dataTree)
    this.emit('setData')
    this.dataTree.sortFramesByHottest()
    this.updateExclusions()
  }

  /**
  * Initialization and draw
  **/

  setExposedCSS () {
    // TODO: When light / dark theme switch implemented, call this after each switch, before redraw
    const computedStyle = window.getComputedStyle(document.body)
    this.exposedCSS = {
      app: computedStyle.getPropertyValue('--area-color-app').trim(),
      deps: computedStyle.getPropertyValue('--area-color-deps').trim(),
      'all-core': computedStyle.getPropertyValue('--area-color-core').trim()
    }
  }

  initializeElements () {
    // Cascades down tree in addContent() append/prepend order
    this.uiContainer.initializeElements()
  }

  draw () {
    // Cascades down tree in addContent() append/prepend order
    this.uiContainer.draw()

    this.changedExclusions.toHide.clear()
    this.changedExclusions.toShow.clear()
  }
}

module.exports = Ui
