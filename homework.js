require([
  "esri/config",
  "esri/Map",
  "esri/views/MapView",
  "esri/core/reactiveUtils",
  "esri/layers/FeatureLayer",
], function (esriConfig, Map, MapView, reactiveUtils, FeatureLayer) {

  esriConfig.apiKey = "YOUR_API_KEY";

  const map = new Map({
    basemap: "arcgis-imagery",
  });

  const citiesRenderer = {
    "type": "simple",
    symbol: {
      type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
      color: "palegreen",
      outline: {
        color: "seagreen",
        width: 0.5
      }
    },
    visualVariables: [
      {
        type: "size",
        field: "pop2000",
        minDataValue: 10000,
        maxDataValue: 1000000,
        minSize: 8,
        maxSize: 40
      },
    ]
  }

  const citiesLabels = {
    symbol: {
      type: "text",
      color: "#FFFFFF",
      haloColor: "#5E8D74",
      haloSize: "2px",
      font: {
        size: "12px",
        family: "Noto Sans",
        style: "italic",
        weight: "normal"
      }
    },
    labelPlacement: "below-center",
    labelExpressionInfo: {
      // format numbers with digit separator using Text
      expression: "$feature.areaname + TextFormatting.NewLine + Text($feature.pop2000, '#,###')",
    },
  };

  const citiesLayer = new FeatureLayer({
    url: "http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/0",
    renderer: citiesRenderer,
    labelingInfo: [citiesLabels],
  });
  map.add(citiesLayer);

  // constant definations
  const QUERY_COUNT_PER_PAGE = 10; // ask for data count per query
  const LIST_ITEM_HEIGHT = 60; // each item height in px
  const LIST_LOAD_MORE_HEIGHT = 20; // each item height in px
  const LIST_LOAD_MORE_TRIGGER_THRESHOLD = 18; // scroll up threshold to trigger load more
  const MAX_VISIBLE_ITEM_COUNT = 30; // max visible item count
  const PAGE_VISIBLE_ITEM_COUNT = 10; // each page can hold item count

  let citiesLayerView = null;
  let citiesHighlight = null; // highlight handler

  const listDivNode = document.getElementById("listDiv");
  const listSpaceNode = document.getElementById("listSpace");
  const listContentNode = document.getElementById("listContent");
  const listLoadMoreNode = document.getElementById("listLoadMore");

  let listItems = []; // list data cache
  let queryNextPage = 0; // when load more, the next query page no.
  let queryPending = false; // if a query is in processing
  let queryMagicWord = 0; // a magic number for checking if response is still valid when returned
  let queryNoMoreData = false; // all data for current view extent is retrieved

  // visible items
  let visibleItemStart = 0;
  let visibleItemCount = 0;

  listDivNode.addEventListener("scroll", (e) => {
    // first check list scroll to the bottom
    if (listLoadMoreNode.offsetTop < listDivNode.clientHeight + listDivNode.scrollTop - LIST_LOAD_MORE_TRIGGER_THRESHOLD) {
      // console.log("reached bottom!");
      loadMoreCitiesList();
    } else {
      // check if visible items need update
      if (listItems.length <= MAX_VISIBLE_ITEM_COUNT) {
        // every item has a visible node, no need
        return;
      }

      const scrollStart = Math.floor((listDivNode.scrollTop + LIST_ITEM_HEIGHT - 1) / LIST_ITEM_HEIGHT);
      const newVisibleItemStart = Math.min(Math.max(0, scrollStart - PAGE_VISIBLE_ITEM_COUNT), listItems.length - MAX_VISIBLE_ITEM_COUNT);
      if (newVisibleItemStart !== visibleItemStart) {
        updateListVisibleItems(newVisibleItemStart);
      }
    }
  });

  // format numbers with digit separator
  const formatSeperatorNumber = (num) => {
    const strArray = num.toString().split("").reverse();
    const result = strArray.reduce((total, current, index) => {
      if (index && index % 3 === 0) {
        return total.concat([",", current]);
      } else {
        return total.concat([current]);
      }
    }, []);
    return result.reverse().join("");
  }

  // update list view scroll size and load more indicator text
  const updateListDecoration = (heightChange = false) => {
    let nodeText = "Up to load more data";
    if (queryPending) {
      nodeText = "Loading...";
    } else if (queryNoMoreData) {
      nodeText = "No more data!!!";
    }
    listLoadMoreNode.innerText = nodeText;

    if (heightChange) {
      const contentHeight = listItems.length * LIST_ITEM_HEIGHT;
      listLoadMoreNode.style.top = contentHeight + "px";
      listSpaceNode.style.height = (contentHeight + LIST_LOAD_MORE_HEIGHT) + "px";
    }
  }

  const reloadCitiesList = () => {
    clearCitiesList();

    listItems = []; // empty cache
    queryNextPage = 0; // restart from page 0
    queryNoMoreData = false;
    visibleItemStart = 0;
    visibleItemCount = 0;
    queryCitiesLayer(queryNextPage);
    updateListDecoration(true);
  };

  const loadMoreCitiesList = () => {
    if (queryNoMoreData || queryPending) {
      // no need for query or
      // a query is already in processing, maybe another load more or reload
      return;
    }

    queryNextPage++;
    queryCitiesLayer(queryNextPage);
  };

  const appendCitiesList = (features) => {
    if (!features.length) {
      return;
    }

    const newItems = features.map(feature => {
      return {
        objectid: feature.attributes.objectid,
        areaname: feature.attributes.areaname,
        population: formatSeperatorNumber(feature.attributes.pop2000),
        geometry: "[" + feature.geometry.x + ", " + feature.geometry.y + "]",
      }
    });
    listItems.splice(listItems.length, 0, ...newItems);

    if (visibleItemCount < MAX_VISIBLE_ITEM_COUNT) {
      visibleItemCount += newItems.length;

      // use DocumentFragment for efficiency
      const fragment = document.createDocumentFragment();
      newItems.forEach(itemData => {
        const itemNode = document.createElement("div");
        itemNode.className = "list-item";
        itemNode.setAttribute("data-objectid", itemData.objectid);

        const itemName = document.createElement("div");
        itemName.className = "list-item-name";
        itemName.appendChild(document.createTextNode(itemData.areaname));
        itemNode.appendChild(itemName);

        const itemPop = document.createElement("div");
        itemPop.className = "list-item-pop";
        itemPop.appendChild(document.createTextNode(itemData.population));
        itemNode.appendChild(itemPop);

        const itemGeometry = document.createElement("div");
        itemGeometry.className = "list-item-geometry";
        itemGeometry.appendChild(document.createTextNode(itemData.geometry));
        itemNode.appendChild(itemGeometry);

        itemNode.addEventListener("mouseenter", handleMouseEnterItem);
        itemNode.addEventListener("mouseleave", handleMouseLeaveItem);

        fragment.appendChild(itemNode);
      });
      listContentNode.appendChild(fragment);
    } else {
      updateListVisibleItems(visibleItemStart + newItems.length);
    }
  };

  const updateListVisibleItems = (newVisibleItemStart) => {
    if (newVisibleItemStart === visibleItemStart) {
      return;
    }

    // optimize dom nodes replacement
    listContentNode.style.display = "none";

    // in case scroll too fast
    const replaceCount = Math.min(Math.abs(newVisibleItemStart - visibleItemStart), MAX_VISIBLE_ITEM_COUNT);
    const front2End = newVisibleItemStart > visibleItemStart; // move front item nodes to the end

    const fragment = document.createDocumentFragment();
    const itemNodes = listContentNode.getElementsByClassName("list-item");

    for (let i = 0; i < replaceCount; i++) {
      const itemNode = listContentNode.removeChild(itemNodes[front2End ? (replaceCount - i - 1) : (MAX_VISIBLE_ITEM_COUNT - i - 1)]);
      const itemData = listItems[front2End ? (visibleItemStart + MAX_VISIBLE_ITEM_COUNT + i) : (newVisibleItemStart + i)];

      itemNode.setAttribute("data-objectid", itemData.objectid);

      const itemName = itemNode.getElementsByClassName("list-item-name")[0];
      itemName.innerText = itemData.areaname;

      const itemPop = itemNode.getElementsByClassName("list-item-pop")[0];
      itemPop.innerText = itemData.population;

      const itemGeometry = itemNode.getElementsByClassName("list-item-geometry")[0];
      itemGeometry.innerText = itemData.geometry;

      fragment.appendChild(itemNode);
    }

    if (front2End || (replaceCount === MAX_VISIBLE_ITEM_COUNT)) {
      listContentNode.appendChild(fragment);
    } else {
      listContentNode.insertBefore(fragment, itemNodes[0]);
    }

    visibleItemStart = newVisibleItemStart;
    listContentNode.style.top = (visibleItemStart * LIST_ITEM_HEIGHT) + 'px';

    listContentNode.style.display = "block";
  };

  const clearCitiesList = () => {
    const itemNodes = listContentNode.getElementsByClassName("list-item");
    const len = itemNodes.length;
    for (let i = 0; i < len; i++) {
      itemNodes[i].removeEventListener("mouseenter", handleMouseEnterItem);
      itemNodes[i].removeEventListener("mouseleave", handleMouseLeaveItem);
    }
    listContentNode.innerHTML = "";
    listContentNode.style.top = "0px";
  };

  function queryCitiesLayer(page) {
    const queryParams = {
      start: page * QUERY_COUNT_PER_PAGE,
      num: QUERY_COUNT_PER_PAGE,
      geometry: view.extent,
      outFields: ["*"],
      returnGeometry: true,
      orderByFields: ["pop2000 DESC"],
    };

    queryMagicWord++;
    const requestMagicWord = queryMagicWord;

    queryPending = true; // mark as processing
    updateListDecoration();

    citiesLayer.queryFeatures(queryParams)
      .then((featureSet) => {
        if (requestMagicWord === queryMagicWord) {
          queryPending = false; // unmark when valid

          if (featureSet.features.length < QUERY_COUNT_PER_PAGE) {
            // not enough data
            queryNoMoreData = true;
          }

          appendCitiesList(featureSet.features);
          updateListDecoration(true);
        }
      }).catch((error) => {
        // console.log(error.error);
        if (requestMagicWord === queryMagicWord) {
          queryPending = false; // unmark when valid
          updateListDecoration();
        }
      });
  }

  // for mouse hover
  const handleMouseEnterItem = (e) => {
    // console.log('enter:' + e.target.dataset.objectid);
    if (citiesLayerView) {
      if (citiesHighlight) {
        citiesHighlight.remove();
        citiesHighlight = null;
      }

      const query = citiesLayerView.createQuery();
      query.where = "objectid=" + e.target.dataset.objectid;
      citiesLayerView.queryFeatures(query).then(featureSet => {
        // due to async callback, prevent multi-item highlighted
        if (citiesHighlight) {
          citiesHighlight.remove();
          citiesHighlight = null;
        }

        // console.log(JSON.stringify(featureSet));
        citiesHighlight = citiesLayerView.highlight(featureSet.features);
      });
    }
  }

  const handleMouseLeaveItem = (e) => {
    // console.log('leave:' + e.target.dataset.objectid);
    if (citiesHighlight) {
      citiesHighlight.remove();
      citiesHighlight = null;
    }
  }

  const view = new MapView({
    map: map,
    center: [-100.4593, 36.9014], // Longitude, latitude
    zoom: 7, // Zoom level
    container: "viewDiv" // Div element
  });

  view.when(() => {
    // listen for when the view is updated, this may be caused by pan, zoom or resize
    // here we wached the stationary value only
    reactiveUtils.when(
      () => view.stationary === true,
      () => {
        // console.log('View stationary is true!!!');
        reloadCitiesList();
      }
    );
  });

  // retrive layerView for highlight use
  view.whenLayerView(citiesLayer).then((layerView) => {
    citiesLayerView = layerView;
  });

});
