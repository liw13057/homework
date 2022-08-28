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

  let citiesLayerView = null;
  let citiesHighlight = null; // highlight handler

  const listDivNode = document.getElementById("listDiv");
  const listContentNode = document.getElementById("listContent");
  const listLoadMoreNode = document.getElementById("listLoadMore");
  listDivNode.addEventListener("scroll", (e) => {
    // check list scroll to the bottom
    if (listLoadMoreNode.offsetTop < listDivNode.clientHeight + listDivNode.scrollTop) {
      // console.log("reached bottom!");
      loadMoreCitiesList();
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

  let queryNextPage = 0; // when load more, the next query page no.
  const queryCountPerPage = 10; // ask for data count per query
  let queryPending = false; // if a query is in processing
  let queryMagicWord = 0; // a magic number for checking if response is still valid when returned
  let queryNoMoreData = false; // all data for current view extent is retrieved or max count is reached

  const reloadCitiesList = () => {
    clearCitiesList();

    queryNextPage = 0; // restart from page 0
    queryNoMoreData = false;
    queryCitiesLayer(queryNextPage);
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

    // use DocumentFragment for efficiency
    const fragment = document.createDocumentFragment();
    features.forEach(feature => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.setAttribute("data-objectid", feature.attributes.objectid);

      const itemName = document.createElement("div");
      itemName.className = "list-item-name";
      itemName.appendChild(document.createTextNode(feature.attributes.areaname));
      item.appendChild(itemName);

      const itemPop = document.createElement("div");
      itemPop.className = "list-item-pop";
      itemPop.appendChild(document.createTextNode(formatSeperatorNumber(feature.attributes.pop2000)));
      item.appendChild(itemPop);

      const itemGeometry = document.createElement("div");
      itemGeometry.className = "list-item-geometry";
      itemGeometry.appendChild(document.createTextNode("[" + feature.geometry.x + ", " + feature.geometry.y + "]"));
      item.appendChild(itemGeometry);

      item.addEventListener("mouseenter", handleMouseEnterItem);
      item.addEventListener("mouseleave", handleMouseLeaveItem);

      fragment.appendChild(item);
    });
    document.getElementById("listContent").appendChild(fragment);
  };

  const clearCitiesList = () => {
    const itemNodes = listContentNode.getElementsByClassName("list-item");
    const len = itemNodes.length;
    for (let i = 0; i < len; i++) {
      itemNodes[i].removeEventListener("mouseenter", handleMouseEnterItem);
      itemNodes[i].removeEventListener("mouseleave", handleMouseLeaveItem);
    }
    listContentNode.innerHTML = "";
  };

  function queryCitiesLayer(page) {
    const queryParams = {
      start: page * queryCountPerPage,
      num: queryCountPerPage,
      geometry: view.extent,
      outFields: ["*"],
      returnGeometry: true,
      orderByFields: ["pop2000 DESC"],
    };

    queryMagicWord++;
    const requestMagicWord = queryMagicWord;

    queryPending = true; // mark as processing

    citiesLayer.queryFeatures(queryParams)
      .then((featureSet) => {
        if (requestMagicWord === queryMagicWord) {
          queryPending = false; // unmark when valid

          if ((featureSet.features.length < queryCountPerPage) || (page === 2)) {
            // not enough data or reached 30 count
            queryNoMoreData = true;
          }

          appendCitiesList(featureSet.features);
        }
      }).catch((error) => {
        // console.log(error.error);
        if (requestMagicWord === queryMagicWord) {
          queryPending = false; // unmark when valid
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
