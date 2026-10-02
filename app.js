(function () {
  'use strict';

  var DATA = window.PAYCHECK_ATLAS;
  var page = document.body.getAttribute('data-page');
  var currentChartMeasure = 'expenses';
  var currentMapMeasure = 'ratio';
  var currentRankDirection = 'top';
  var mapFocusedStateCode = null;
  var mapZoom = 1;
  var latestRows = [];
  var activeHomeHouseCategory = 'housing';
  var homeSwipeScenarioA = null;
  var homeSwipeScenarioB = null;

  var MAP_LAYOUT = {
    WA: [1, 1], ID: [2, 1], MT: [3, 1], ND: [4, 1], MN: [5, 1], WI: [6, 1], MI: [7, 1], NY: [8, 1], VT: [9, 1], NH: [10, 1], ME: [11, 1],
    OR: [1, 2], NV: [2, 2], WY: [3, 2], SD: [4, 2], IA: [5, 2], IL: [6, 2], IN: [7, 2], OH: [8, 2], PA: [9, 2], MA: [10, 2], CT: [11, 2],
    CA: [1, 3], UT: [2, 3], CO: [3, 3], NE: [4, 3], MO: [5, 3], KY: [6, 3], WV: [7, 3], VA: [8, 3], NJ: [9, 3], RI: [10, 3],
    AZ: [1, 4], NM: [2, 4], KS: [3, 4], AR: [4, 4], TN: [5, 4], NC: [6, 4], MD: [7, 4], DE: [8, 4],
    TX: [3, 5], OK: [4, 5], LA: [5, 5], MS: [6, 5], AL: [7, 5], GA: [8, 5], SC: [9, 5], FL: [10, 5],
    AK: [1, 6], HI: [2, 6]
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function money(value) {
    var rounded = Math.round(value);
    var sign = rounded < 0 ? '-' : '';
    return sign + '$' + Math.abs(rounded).toLocaleString('en-US');
  }

  function compactMoney(value) {
    var rounded = Math.round(value);
    var sign = rounded < 0 ? '-' : '';
    var absolute = Math.abs(rounded);
    if (absolute >= 1000000) return sign + '$' + (absolute / 1000000).toFixed(1) + 'm';
    if (absolute >= 1000) return sign + '$' + (absolute / 1000).toFixed(1) + 'k';
    return sign + '$' + absolute.toLocaleString('en-US');
  }

  function signedMoney(value) {
    return (value >= 0 ? '+' : '') + money(value);
  }

  function percent(value) {
    return Math.round(value * 100) + '%';
  }

  function ratio(value) {
    return value.toFixed(2) + '×';
  }

  function findBy(list, key, value) {
    return list.filter(function (item) { return item[key] === value; })[0] || list[0];
  }

  function latestYear() {
    return DATA.years[DATA.years.length - 1];
  }

  function costYearFactor(year) {
    return 1 + ((latestYear() - Number(year)) * 0.028);
  }

  function cpiFactor(year, category) {
    var current = findBy(DATA.cpi || [], 'year', latestYear());
    var point = findBy(DATA.cpi || [], 'year', Number(year));
    if (!current || !point || !current.all) return costYearFactor(year);
    var currentValue = current[category] || current.all;
    var pointValue = point[category] || point.all;
    return pointValue / currentValue;
  }

  function wageYearFactor(year) {
    return 1 - ((latestYear() - Number(year)) * 0.022);
  }

  function calculate(options) {
    var state = findBy(DATA.states, 'code', options.stateCode || 'TX');
    var career = findBy(DATA.careers, 'id', options.careerId || 'nurse');
    var household = findBy(DATA.households, 'id', options.householdId || 'solo');
    var mode = findBy(DATA.modes, 'id', options.modeId || 'balanced');
    var percentile = DATA.percentiles[options.percentileKey || 'median'];
    var housingProfile = findBy(DATA.housing || [], 'id', options.housingId || 'one-bedroom');
    var year = Number(options.year || latestYear());
    var priceFactor = state.rpp / 100;
    var yearCosts = cpiFactor(year, 'all');
    var salary = Number(options.customSalary) > 0
      ? Number(options.customSalary)
      : career.base * state.wage * percentile.multiplier * wageYearFactor(year);

    var selectedHousing = options.housingId ? housingProfile : null;
    var housing = state.rent * (selectedHousing ? selectedHousing.rentFactor : household.home) * cpiFactor(year, 'housing');
    var food = 460 * household.food * priceFactor * cpiFactor(year, 'food');
    var transport = state.transport * household.transport * cpiFactor(year, 'transport');
    var health = 315 * household.health * priceFactor * cpiFactor(year, 'health');
    var childcare = household.childcare ? 1200 * (household.children === 2 ? 1.45 : 1) * priceFactor * cpiFactor(year, 'other') : 0;
    var utilities = 190 * (selectedHousing ? selectedHousing.rentFactor * 0.78 + 0.22 : household.home * 0.78 + 0.22) * priceFactor * cpiFactor(year, 'utilities');
    var other = 245 * (1 + household.children * 0.3) * priceFactor * cpiFactor(year, 'other');
    var discretionary = mode.discretionary * priceFactor * cpiFactor(year, 'other');
    var savings = mode.savings;
    var essentials = housing + food + transport + health + childcare + utilities + other;
    var monthlyBudget = essentials + discretionary + savings;
    var takeHome = salary * (1 - state.tax) / 12;
    var leftover = takeHome - monthlyBudget;
    var requiredGross = monthlyBudget * 12 / (1 - state.tax);
    var rows = [
      { key: 'housing', label: 'Housing', value: housing, className: 'housing' },
      { key: 'food', label: 'Food', value: food, className: 'food' },
      { key: 'transport', label: 'Transport', value: transport, className: 'transport' },
      { key: 'health', label: 'Health care', value: health, className: 'health' },
      { key: 'childcare', label: 'Childcare', value: childcare, className: 'childcare' },
      { key: 'utilities', label: 'Utilities', value: utilities, className: 'utilities' },
      { key: 'other', label: 'Other needs', value: other, className: 'other' },
      { key: 'discretionary', label: 'Personal spending', value: discretionary, className: 'other' },
      { key: 'savings', label: 'Savings target', value: savings, className: 'other' }
    ];
    return {
      state: state,
      career: career,
      household: household,
      mode: mode,
      housingProfile: selectedHousing || { id: 'household-default', label: household.name + ' home assumption', bedrooms: null, bathrooms: null, sqft: null, rentFactor: household.home },
      housingId: selectedHousing ? selectedHousing.id : '',
      percentile: percentile,
      percentileKey: options.percentileKey || 'median',
      year: year,
      salary: salary,
      customSalary: Number(options.customSalary) > 0 ? Number(options.customSalary) : null,
      takeHome: takeHome,
      essentials: essentials,
      monthlyBudget: monthlyBudget,
      leftover: leftover,
      ratio: takeHome / monthlyBudget,
      requiredGross: requiredGross,
      salaryGap: salary - requiredGross,
      housingShare: housing / essentials,
      housingCost: housing,
      priceAdjustedSalary: salary / priceFactor,
      priceFactor: priceFactor,
      cpiIndex: (findBy(DATA.cpi || [], 'year', year) || {}).all || 100,
      rows: rows
    };
  }

  function optionsFromControls() {
    return {
      careerId: $('#career-select').value,
      stateCode: $('#state-select').value,
      year: $('#year-select').value,
      householdId: $('#household-select').value,
      percentileKey: $('#percentile-select').value,
      modeId: $('#mode-select').value,
      housingId: $('#housing-select').value,
      customSalary: $('#custom-salary').value
    };
  }

  function selectOptions(select, items, valueKey, labelFn) {
    select.innerHTML = items.map(function (item) {
      var value = item[valueKey];
      return '<option value="' + value + '">' + labelFn(item) + '</option>';
    }).join('');
  }

  function setText(selector, value) {
    var element = $(selector);
    if (element) element.textContent = value;
  }

  function mapValue(item, measure) {
    if (measure === 'leftover') return item.leftover;
    if (measure === 'required') return item.requiredGross;
    if (measure === 'price') return item.state.rpp;
    if (measure === 'housing') return item.housingCost / item.takeHome;
    return item.ratio;
  }

  function mapValueLabel(item, measure) {
    if (measure === 'leftover') return signedMoney(item.leftover);
    if (measure === 'required') return compactMoney(item.requiredGross);
    if (measure === 'price') return item.state.rpp.toFixed(1);
    if (measure === 'housing') return percent(item.housingCost / item.takeHome);
    return ratio(item.ratio);
  }

  function applyMapZoom() {
    var mapSvg = $('#atlas-map svg');
    if (!mapSvg) return;
    mapSvg.style.transformOrigin = '50% 50%';
    mapSvg.style.transform = 'scale(' + mapZoom + ')';
    var zoomValue = $('#map-zoom-value');
    if (zoomValue) zoomValue.textContent = Math.round(mapZoom * 100) + '%';
    var zoomOut = $('#map-zoom-out');
    var zoomIn = $('#map-zoom-in');
    if (zoomOut) zoomOut.disabled = mapZoom <= 0.85;
    if (zoomIn) zoomIn.disabled = mapZoom >= 1.8;
  }

  function setMapZoom(value) {
    mapZoom = clamp(value, 0.85, 1.8);
    applyMapZoom();
  }

  function hideMapTooltip() {
    var tooltip = $('#map-tooltip');
    if (tooltip) tooltip.classList.remove('visible');
  }

  function showMapTooltip(event, item, measure, result) {
    var tooltip = $('#map-tooltip');
    var mapHost = $('#atlas-map');
    if (!tooltip || !mapHost) return;
    var difference = item.leftover - result.leftover;
    var differenceText = item.state.code === result.state.code
      ? 'This is the main state'
      : (difference >= 0 ? '+' + money(difference) + ' more leftover vs ' + result.state.code : '−' + money(Math.abs(difference)) + ' less leftover vs ' + result.state.code);
    tooltip.innerHTML = '<strong>' + item.state.name + '</strong><span>' + mapValueLabel(item, measure) + ' · map lens</span><span>Leftover: ' + signedMoney(item.leftover) + ' / mo</span><span>' + differenceText + '</span>';
    var bounds = mapHost.getBoundingClientRect();
    var left = event.clientX - bounds.left + 14;
    var top = event.clientY - bounds.top + 14;
    tooltip.style.left = Math.min(Math.max(left, 10), Math.max(10, bounds.width - 210)) + 'px';
    tooltip.style.top = Math.min(Math.max(top, 10), Math.max(10, bounds.height - 105)) + 'px';
    tooltip.classList.add('visible');
  }

  function renderMap(result) {
    var measure = $('#map-measure').value;
    currentMapMeasure = measure;
    var compareCode = $('#compare-state-select').value;
    var scenarios = DATA.states.map(function (state) {
      return calculate({
        careerId: result.career.id,
        stateCode: state.code,
        year: result.year,
        householdId: result.household.id,
        percentileKey: result.percentileKey,
        modeId: result.mode.id,
        housingId: result.housingId,
        customSalary: result.customSalary || ''
      });
    });
    var values = scenarios.map(function (item) { return mapValue(item, measure); });
    var minimum = Math.min.apply(null, values);
    var maximum = Math.max.apply(null, values);
    var span = maximum - minimum || 1;
    var higherIsBetter = measure === 'ratio' || measure === 'leftover';
    var focused = scenarios.filter(function (item) { return item.state.code === (mapFocusedStateCode || result.state.code); })[0] || result;
    var scoreFor = function (item) {
      var raw = (mapValue(item, measure) - minimum) / span;
      var score = higherIsBetter ? raw : 1 - raw;
      return clamp(score, 0, 1);
    };
    var mapHost = $('#atlas-map');
    var mapSvg = mapHost.querySelector('svg');
    if (!mapSvg) {
      mapHost.innerHTML = window.PAYCHECK_ATLAS_MAP || '<div class="map-loading">Map asset unavailable</div>';
      mapSvg = mapHost.querySelector('svg');
      if (mapSvg && !$('#map-tooltip')) {
        var tooltip = document.createElement('div');
        tooltip.id = 'map-tooltip';
        tooltip.className = 'map-tooltip';
        tooltip.setAttribute('role', 'status');
        tooltip.setAttribute('aria-live', 'polite');
        mapHost.appendChild(tooltip);
      }
    }
    if (mapSvg) {
      mapSvg.classList.add('state-map-inline');
      scenarios.forEach(function (item) {
        var group = document.getElementById(item.state.code);
        if (!group) return;
        var score = scoreFor(item);
        var color = 'hsl(' + Math.round(36 + score * 44) + ', ' + Math.round(76 + score * 10) + '%, ' + Math.round(55 + score * 10) + '%)';
        var active = item.state.code === result.state.code;
        var compare = item.state.code === compareCode;
        var stroke = active ? '#c9f56a' : compare ? '#ff9c63' : '#1b2c36';
        var strokeWidth = active || compare ? '3' : '1.25';
        group.setAttribute('data-map-state', item.state.code);
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', item.state.name + ': ' + mapValueLabel(item, measure));
        group.style.cursor = 'pointer';
        group.onmouseenter = function (event) { showMapTooltip(event, item, measure, result); };
        group.onmousemove = function (event) { showMapTooltip(event, item, measure, result); };
        group.onmouseleave = hideMapTooltip;
        group.onclick = function () {
          mapFocusedStateCode = item.state.code;
          renderMap(result);
        };
        group.onkeydown = function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            mapFocusedStateCode = item.state.code;
            renderMap(result);
          }
        };
        var title = group.querySelector('title');
        if (!title) {
          title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          group.insertBefore(title, group.firstChild);
        }
        title.textContent = item.state.name + ' · ' + mapValueLabel(item, measure);
        group.querySelectorAll('path.boundary').forEach(function (path) {
          path.style.fill = color;
          path.style.stroke = stroke;
          path.style.strokeWidth = strokeWidth;
          path.style.transition = 'fill .25s ease, stroke .2s ease, stroke-width .2s ease';
        });
        group.querySelectorAll('text').forEach(function (label) {
          label.style.pointerEvents = 'none';
        });
      });
      applyMapZoom();
    }
    setText('#map-selected-state', focused.state.name);
    setText('#map-selected-copy', focused.state.name + ' gives this ' + result.career.name + ' scenario ' + mapValueLabel(focused, measure) + ' on the selected map lens.');
    $('#map-selected-detail').innerHTML = [
      ['Home benchmark', focused.housingProfile.label, ''],
      ['Rent / month', money(focused.housingCost), ''],
      ['Take-home / month', money(focused.takeHome), ''],
      ['Modeled budget', money(focused.monthlyBudget), ''],
      ['Leftover / month', signedMoney(focused.leftover), focused.leftover >= 0 ? 'good' : 'tight'],
      ['Salary needed', compactMoney(focused.requiredGross), ''],
      ['Housing share', percent(focused.housingShare), '']
    ].map(function (row) {
      return '<div class=\"map-story-row\"><span>' + row[0] + '</span><strong class=\"' + row[2] + '\">' + row[1] + '</strong></div>';
    }).join('');
    var compareButton = $('#map-compare-button');
    if (compareButton) compareButton.disabled = focused.state.code === compareCode;
  }

  function renderKpis(result) {
    var cards = [
      ['Take-home / month', money(result.takeHome), 'after modeled taxes', '↘'],
      ['Monthly leftover', signedMoney(result.leftover), result.leftover >= 0 ? 'breathing room after the plan' : 'monthly gap to close', result.leftover >= 0 ? '✦' : '△'],
      ['Break-even salary', compactMoney(result.requiredGross), 'gross annual income for this plan', '≈'],
      ['Housing share', percent(result.housingShare), 'of essential expenses', '⌂']
    ];
    $('#dashboard-kpis').innerHTML = cards.map(function (card) {
      return '<article class="kpi-card"><div class="kpi-top"><span>' + card[0] + '</span><span class="kpi-icon">' + card[3] + '</span></div><strong class="kpi-value">' + card[1] + '</strong><span class="kpi-note">' + card[2] + '</span></article>';
    }).join('');
  }

  function renderGauge(result) {
    var coverage = clamp(result.ratio / 2, 0, 1) * 100;
    var gauge = $('#affordability-gauge');
    gauge.style.background = 'conic-gradient(var(--lime) 0 ' + coverage + '%, #29343d ' + coverage + '% 100%)';
    setText('#gauge-value', ratio(result.ratio));
    setText('#gauge-caption', result.leftover >= 0
      ? 'Your take-home pay covers the modeled budget with ' + money(result.leftover) + ' left over.'
      : 'This plan is short by ' + money(Math.abs(result.leftover)) + ' each month.');
  }

  function renderComparison(result, comparison) {
    var card = function (item, primary) {
      return '<div class="compare-card' + (primary ? ' primary' : '') + '"><div class="compare-card-top"><strong>' + item.state.name + '</strong><span class="compare-tag">' + (primary ? 'selected' : 'comparison') + '</span></div><div class="compare-metrics"><div class="compare-metric"><span>Ratio</span><b class="' + (item.ratio >= 1 ? 'good' : '') + '">' + ratio(item.ratio) + '</b></div><div class="compare-metric"><span>Leftover</span><b class="' + (item.leftover >= 0 ? 'good' : '') + '">' + signedMoney(item.leftover) + '</b></div></div></div>';
    };
    $('#compare-cards').innerHTML = card(result, true) + card(comparison, false);
    var difference = result.leftover - comparison.leftover;
    $('#compare-delta').innerHTML = difference >= 0
      ? '<strong>' + result.state.name + '</strong> leaves ' + money(difference) + ' more each month than ' + comparison.state.name + ' under the same scenario.'
      : '<strong>' + comparison.state.name + '</strong> leaves ' + money(Math.abs(difference)) + ' more each month than ' + result.state.name + ' under the same scenario.';
  }

  function renderWaterfall(result) {
    var rows = result.rows.filter(function (item) { return item.value > 0; });
    var max = Math.max.apply(null, rows.map(function (item) { return item.value; }));
    $('#waterfall-chart').innerHTML = rows.map(function (item) {
      var shown = currentChartMeasure === 'expenses'
        ? percent(item.value / result.monthlyBudget)
        : money(item.value);
      var width = currentChartMeasure === 'expenses'
        ? (item.value / result.monthlyBudget) * 100
        : (item.value / max) * 100;
      return '<div class="waterfall-row"><span class="waterfall-label">' + item.label + '</span><div class="waterfall-track"><div class="waterfall-fill ' + item.className + '" style="width:' + width + '%"></div></div><span class="waterfall-value">' + shown + '</span></div>';
    }).join('');
  }

  function renderDrivers(result) {
    var drivers = result.rows.filter(function (item) { return item.key !== 'savings' && item.key !== 'discretionary' && item.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    var maximum = drivers[0] ? drivers[0].value : 1;
    $('#driver-list').innerHTML = drivers.slice(0, 5).map(function (item) {
      return '<div class="driver-row"><span class="driver-label">' + item.label + '</span><span class="driver-value">' + money(item.value) + '</span><div class="driver-meter"><i style="width:' + (item.value / maximum * 100) + '%"></i></div></div>';
    }).join('');
    if (drivers[0]) {
      $('#driver-callout').innerHTML = '<strong>' + drivers[0].label + '</strong> is the largest essential line in this plan at ' + percent(drivers[0].value / result.essentials) + ' of essentials. Try changing household or location to see which driver moves.';
    }
  }

  function renderRanked(result) {
    var measure = $('#rank-measure').value;
    var values = DATA.states.map(function (state) {
      var item = calculate({
        careerId: result.career.id,
        stateCode: state.code,
        year: result.year,
        householdId: result.household.id,
        percentileKey: result.percentileKey,
        modeId: result.mode.id,
        housingId: result.housingId,
        customSalary: result.customSalary || ''
      });
      item.rankValue = measure === 'ratio' ? item.ratio : measure === 'leftover' ? item.leftover : measure === 'salary' ? item.salary : item.state.rpp;
      return item;
    });
    var favorableValue = function (item) { return measure === 'price' ? -item.rankValue : item.rankValue; };
    values.sort(function (a, b) {
      var difference = favorableValue(b) - favorableValue(a);
      return currentRankDirection === 'top' ? difference : -difference;
    });
    var visible = values.slice(0, 10);
    var min = Math.min.apply(null, visible.map(favorableValue));
    var max = Math.max.apply(null, visible.map(favorableValue));
    var span = max - min || 1;
    var format = measure === 'ratio' ? ratio : measure === 'price' ? function (v) { return v.toFixed(1); } : compactMoney;
    $('#ranked-list').innerHTML = visible.map(function (item, index) {
      var fill = ((favorableValue(item) - min) / span * 55 + 45);
      return '<div class="ranked-row"><span class="rank-number">' + String(index + 1).padStart(2, '0') + '</span><span class="rank-name">' + item.state.name + '</span><div class="rank-bar-track"><div class="rank-bar" style="width:' + fill + '%"></div></div><span class="rank-value">' + format(item.rankValue) + '</span></div>';
    }).join('');
  }

  function lineSvg(series, colors, labels) {
    var width = 420;
    var height = 220;
    var all = [];
    series.forEach(function (set) { all = all.concat(set.values); });
    var min = Math.min.apply(null, all);
    var max = Math.max.apply(null, all);
    var span = max - min || 1;
    var points = function (values) {
      return values.map(function (value, index) {
        var x = 18 + (index / (values.length - 1)) * 384;
        var y = 190 - ((value - min) / span) * 155;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
    };
    var grid = [45, 92, 139, 186].map(function (y) {
      return '<line x1="18" y1="' + y + '" x2="402" y2="' + y + '" class="trend-grid-line"></line>';
    }).join('');
    var paths = series.map(function (set, index) {
      var pts = points(set.values);
      var area = '18,190 ' + pts + ' 402,190';
      return '<polygon points="' + area + '" fill="' + colors[index] + '" class="trend-area"></polygon><polyline points="' + pts + '" stroke="' + colors[index] + '" class="trend-path"></polyline>';
    }).join('');
    var endDots = series.map(function (set, index) {
      var x = 402;
      var y = 190 - ((set.values[set.values.length - 1] - min) / span) * 155;
      return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + colors[index] + '"></circle>';
    }).join('');
    return '<svg viewBox="0 0 420 220" role="img" aria-label="' + labels.join(' versus ') + ' trend">' + grid + paths + endDots + '</svg>';
  }

  function renderTrend(result, target) {
    var series = [
      { values: DATA.years.map(function (year) { return calculate({ careerId: result.career.id, stateCode: result.state.code, year: year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' }).takeHome; }) },
      { values: DATA.years.map(function (year) { return calculate({ careerId: result.career.id, stateCode: result.state.code, year: year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' }).monthlyBudget; }) }
    ];
    target.innerHTML = lineSvg(series, ['#c9f56a', '#ff9c63'], ['Take-home', 'Budget']);
    var firstTakeHome = series[0].values[0];
    var lastTakeHome = series[0].values[series[0].values.length - 1];
    var firstBudget = series[1].values[0];
    var lastBudget = series[1].values[series[1].values.length - 1];
    var payChange = Math.round((lastTakeHome / firstTakeHome - 1) * 100);
    var budgetChange = Math.round((lastBudget / firstBudget - 1) * 100);
    var insight = budgetChange > payChange
      ? 'Modeled costs grew ' + budgetChange + '% while take-home pay grew ' + payChange + '%—the plan tightened faster than the paycheck.'
      : 'Take-home pay grew ' + payChange + '% while modeled costs grew ' + budgetChange + '%—this scenario gained some room over time.';
    var insightSelector = target.id === 'dashboard-trend' ? '#dashboard-trend-insight' : '#home-trend-insight';
    setText(insightSelector, insight + ' This is a modeled trend, not a record of one person\'s spending.');
  }

  function renderCpiLens(result, target) {
    if (!target) return;
    var takeHomes = DATA.years.map(function (year) {
      return calculate({ careerId: result.career.id, stateCode: result.state.code, year: year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' }).takeHome;
    });
    var budgets = DATA.years.map(function (year) {
      return calculate({ careerId: result.career.id, stateCode: result.state.code, year: year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' }).monthlyBudget;
    });
    var paycheckIndex = takeHomes.map(function (value) { return value / takeHomes[0] * 100; });
    var budgetIndex = budgets.map(function (value) { return value / budgets[0] * 100; });
    target.innerHTML = lineSvg([
      { values: paycheckIndex },
      { values: budgetIndex }
    ], ['#c9f56a', '#ff9c63'], ['Paycheck index', 'Basic-life cost index']);
    var payChange = Math.round(paycheckIndex[paycheckIndex.length - 1] - 100);
    var budgetChange = Math.round(budgetIndex[budgetIndex.length - 1] - 100);
    var insight = budgetChange > payChange
      ? 'The basic-life plan rose ' + budgetChange + '% while the paycheck rose ' + payChange + '%—purchasing power tightened.'
      : 'The paycheck rose ' + payChange + '% while the basic-life plan rose ' + budgetChange + '%—purchasing power improved.';
    var insightSelector = target.id === 'dashboard-trend' ? '#dashboard-trend-insight' : '#home-trend-insight';
    var startYear = DATA.years[0];
    setText(insightSelector, insight + ' Both lines are indexed to ' + startYear + ' = 100 using prototype CPI-style inputs.');
    if (target.id === 'dashboard-trend') {
      setText('#trend-start', startYear + ' = 100');
      setText('#trend-end', String(latestYear()));
    } else {
      setText('#home-trend-start', startYear + ' = 100');
      setText('#home-trend-end', String(latestYear()));
    }
  }

  function housingSpec(profile) {
    if (!profile || profile.bedrooms === null || profile.bedrooms === undefined) return profile ? profile.label : '';
    var bedroomText = profile.bedrooms === 0 ? 'Studio' : profile.bedrooms + (profile.bedrooms === 1 ? ' bedroom' : ' bedrooms');
    var bathText = profile.bathrooms === 1 ? '1 bath' : profile.bathrooms + ' baths';
    var sqftText = Number(profile.sqft).toLocaleString('en-US') + ' sq ft';
    return bedroomText + ' · ' + bathText + ' · ' + sqftText;
  }

  function housingCardMarkup(item, label, className, compact) {
    var rentShare = item.housingCost / item.takeHome;
    var tag = label || 'scenario';
    return '<article class="' + (compact ? 'home-housing-card ' : 'housing-card ') + (className || '') + '"><span>' + tag + '</span><h3>' + item.state.name + '</h3><small class="' + (compact ? 'home-housing-spec' : 'housing-spec') + '">' + housingSpec(item.housingProfile) + '</small><strong class="' + (compact ? 'home-housing-rent' : 'housing-rent') + '">' + money(item.housingCost) + '<small> / month rent</small></strong><div class="' + (compact ? 'home-housing-details' : 'housing-details') + '"><div><span>Rent share</span><strong class="' + (rentShare <= .3 ? 'good' : 'tight') + '">' + percent(rentShare) + '</strong></div><div><span>After full plan</span><strong class="' + (item.leftover >= 0 ? 'good' : 'tight') + '">' + signedMoney(item.leftover) + '</strong></div></div></article>';
  }

  function renderHousingLens(result, comparison) {
    var scenarios = DATA.states.map(function (state) {
      return calculate({ careerId: result.career.id, stateCode: state.code, year: result.year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    });
    var byRent = scenarios.slice().sort(function (a, b) { return a.housingCost - b.housingCost; });
    var lowest = byRent[0];
    var highest = byRent[byRent.length - 1];
    var selected = [
      { item: result, label: 'main state', className: 'main' },
      { item: comparison, label: 'side-by-side', className: 'compare' },
      { item: lowest, label: 'lowest modeled rent', className: '' },
      { item: highest, label: 'highest modeled rent', className: '' }
    ];
    var seen = {};
    selected = selected.filter(function (entry) {
      if (seen[entry.item.state.code]) return false;
      seen[entry.item.state.code] = true;
      return true;
    });
    setText('#housing-benchmark-copy', 'Same ' + result.housingProfile.label + ' · same career, household, and salary lens · different coordinates.');
    $('#housing-cards').innerHTML = selected.map(function (entry) { return housingCardMarkup(entry.item, entry.label, entry.className, false); }).join('');
    var rentGap = highest.housingCost - lowest.housingCost;
    $('#housing-insight').innerHTML = '<strong>' + highest.state.name + '</strong> asks ' + money(rentGap) + ' more per month than ' + lowest.state.name + ' for the same housing benchmark. The map and cards show how that rent difference travels through the full paycheck plan.';
  }

  function renderHomeHousing(scenarioA, scenarioB) {
    setText('#home-housing-label', scenarioA.housingProfile.label);
    setText('#home-move-a', scenarioA.state.name);
    setText('#home-move-b', scenarioB.state.name);
    renderHomeStateSwipe(scenarioA, scenarioB);
    $('#home-housing-cards').innerHTML = housingCardMarkup(scenarioA, 'from', 'main', true) + housingCardMarkup(scenarioB, 'to', 'compare', true);
    var rentDifference = scenarioA.housingCost - scenarioB.housingCost;
    var winner = rentDifference <= 0 ? scenarioA : scenarioB;
    setText('#home-move-caption', 'The home stays constant. ' + winner.state.name + ' leaves ' + money(Math.abs(scenarioA.leftover - scenarioB.leftover)) + ' more monthly room under this plan.');
    animateHomeHouseMove();
    $('#home-housing-insight').innerHTML = '<strong>' + winner.state.name + '</strong> gives this ' + scenarioA.housingProfile.label.toLowerCase() + ' a lower modeled rent. The difference is ' + money(Math.abs(rentDifference)) + ' per month before food, transportation, taxes, and the rest of the life plan are added.';
  }

  function updateHomeStateSwipe(value) {
    var swipe = $('#home-state-swipe');
    if (swipe) swipe.style.setProperty('--split', String(value) + '%');
    var numericValue = Math.round(Number(value) || 50);
    var stateA = $('#home-swipe-a-state');
    var stateB = $('#home-swipe-b-state');
    var stateAName = stateA ? stateA.textContent : 'State A';
    var stateBName = stateB ? stateB.textContent : 'State B';
    setText('#home-swipe-position', numericValue + '% ' + stateAName + ' · ' + (100 - numericValue) + '% ' + stateBName + ' visible');
    var divider = $('#home-state-divider');
    if (divider) divider.setAttribute('aria-valuetext', numericValue + ' percent ' + stateAName + ' and ' + (100 - numericValue) + ' percent ' + stateBName + ' visible');
    if (!homeSwipeScenarioA || !homeSwipeScenarioB) return;
    var transition = clamp((Number(value) - 18) / 64, 0, 1);
    var blend = function (key) { return homeSwipeScenarioA[key] + ((homeSwipeScenarioB[key] - homeSwipeScenarioA[key]) * transition); };
    var rent = blend('housingCost');
    var takeHome = blend('takeHome');
    var plan = blend('monthlyBudget');
    var leftover = blend('leftover');
    var ratioValue = blend('ratio');
    var activeName = transition < .45 ? stateAName : transition > .55 ? stateBName : stateAName + ' ↔ ' + stateBName;
    setText('#home-swipe-active-state', activeName);
    setText('#home-swipe-active-copy', transition < .05 || transition > .95 ? 'Endpoint scenario · observed at ' + (transition < .5 ? stateAName : stateBName) : 'Visual transition between the two endpoint scenarios');
    setText('#home-swipe-rent', money(rent));
    setText('#home-swipe-pay', money(takeHome));
    setText('#home-swipe-plan', money(plan));
    setText('#home-swipe-live-leftover', signedMoney(leftover));
    setText('#home-swipe-ratio', ratio(ratioValue));
    setText('#home-swipe-explanation', 'At this position, modeled rent is ' + money(rent) + ' per month, the full plan is ' + money(plan) + ', and the household has ' + signedMoney(leftover) + ' left after expenses. The endpoints are real scenarios; the middle is a visual transition between them.');
  }

  function renderHomeStateSwipe(scenarioA, scenarioB) {
    homeSwipeScenarioA = scenarioA;
    homeSwipeScenarioB = scenarioB;
    setText('#home-swipe-a-state', scenarioA.state.name);
    setText('#home-swipe-b-state', scenarioB.state.name);
    setText('#home-swipe-a-leftover', signedMoney(scenarioA.leftover));
    setText('#home-swipe-b-leftover', signedMoney(scenarioB.leftover));
    setText('#home-swipe-a-copy', money(scenarioA.housingCost) + ' rent · ' + percent(scenarioA.housingShare) + ' of essentials');
    setText('#home-swipe-b-copy', money(scenarioB.housingCost) + ' rent · ' + percent(scenarioB.housingShare) + ' of essentials');
    var delta = scenarioA.leftover - scenarioB.leftover;
    setText('#home-swipe-explanation', 'The divider reveals two versions of the same life. ' + (delta >= 0 ? scenarioA.state.name : scenarioB.state.name) + ' leaves ' + money(Math.abs(delta)) + ' more per month after the same career, home, and lifestyle plan.');
    var divider = $('#home-state-divider');
    updateHomeStateSwipe(divider ? divider.value : 50);
  }

  function animateHomeHouseMove() {
    var house = $('#home-moving-house');
    if (!house) return;
    house.classList.remove('is-moving');
    void house.offsetWidth;
    house.classList.add('is-moving');
    window.setTimeout(function () { house.classList.remove('is-moving'); }, 900);
  }

  function houseRow(result, key) {
    if (key === 'lifestyle') {
      var other = result.rows.filter(function (item) { return item.key === 'other'; })[0];
      var discretionary = result.rows.filter(function (item) { return item.key === 'discretionary'; })[0];
      var childcare = result.rows.filter(function (item) { return item.key === 'childcare'; })[0];
      return { key: key, label: 'Other life costs', value: (other ? other.value : 0) + (discretionary ? discretionary.value : 0) + (childcare ? childcare.value : 0), className: 'other' };
    }
    return result.rows.filter(function (item) { return item.key === key; })[0] || { key: key, label: key, value: 0, className: 'other' };
  }

  function careerIconMarkup(career) {
    var icons = {
      nurse: '<circle cx="32" cy="15" r="7" fill="none" stroke="currentColor" stroke-width="2.5"></circle><path d="M19 47 C19 36 24 28 32 28 C40 28 45 36 45 47" fill="currentColor" opacity=".85"></path><path d="M25 38 C25 48 39 48 39 38" fill="none" stroke="#091219" stroke-width="2"></path><circle cx="49" cy="18" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M44 18 H54 M49 13 V23" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>',
      developer: '<rect x="11" y="12" width="42" height="29" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"></rect><path d="M7 48 H57 L52 53 H12 Z" fill="currentColor" opacity=".85"></path><path d="M24 24 L19 29 L24 34 M40 24 L45 29 L40 34 M35 22 L29 36" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>',
      teacher: '<rect x="8" y="10" width="47" height="31" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"></rect><text x="18" y="32" fill="currentColor" font-size="16" font-family="monospace" font-weight="900">ABC</text><path d="M38 46 L54 55 M38 46 L43 55" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path><path d="M14 51 H34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>',
      analyst: '<path d="M10 51 H55" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path><path d="M17 47 V34 M28 47 V25 M39 47 V30 M50 47 V17" stroke="currentColor" stroke-width="6" stroke-linecap="round"></path><path d="M15 19 L25 14 L35 20 L49 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="49" cy="10" r="3" fill="#091219" stroke="currentColor" stroke-width="2"></circle>',
      electrician: '<path d="M12 22 Q32 4 52 22 V29 H12 Z" fill="currentColor" opacity=".85"></path><path d="M32 19 L24 35 H31 L27 52 L43 31 H35 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"></path><circle cx="49" cy="47" r="8" fill="none" stroke="currentColor" stroke-width="2.5"></circle><path d="M49 43 V51 M45 47 H53" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>',
      mechanic: '<circle cx="32" cy="31" r="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 3"></circle><circle cx="32" cy="31" r="6" fill="none" stroke="currentColor" stroke-width="2.5"></circle><path d="M12 15 L21 24 M18 12 L24 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path><path d="M43 42 L56 55" stroke="currentColor" stroke-width="5" stroke-linecap="round"></path><path d="M47 39 L53 33 L58 38 L52 44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"></path>',
      retail: '<path d="M14 24 H50 L54 53 H10 Z" fill="currentColor" opacity=".82"></path><path d="M21 24 C21 10 43 10 43 24" fill="none" stroke="currentColor" stroke-width="2.5"></path><path d="M22 35 H42 M26 42 H38" stroke="#091219" stroke-width="2" stroke-linecap="round"></path><path d="M45 13 L55 8 L58 18 Z" fill="none" stroke="currentColor" stroke-width="2"></path>',
      designer: '<path d="M13 42 C8 27 19 13 34 13 C48 13 57 23 51 38 C45 52 19 56 13 42 Z" fill="none" stroke="currentColor" stroke-width="2.5"></path><circle cx="23" cy="27" r="3" fill="currentColor"></circle><circle cx="33" cy="21" r="3" fill="currentColor"></circle><circle cx="43" cy="27" r="3" fill="currentColor"></circle><path d="M36 46 L53 29 M50 27 L56 33" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>',
      fallback: '<circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="2.5"></circle><path d="M22 32 H42 M32 22 V42" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>'
    };
    return '<svg class="career-icon-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + (icons[career.id] || icons.fallback) + '</svg>';
  }

  function careerVisualMarkup(career) {
    var figure = '<ellipse cx="67" cy="118" rx="39" ry="6" fill="rgba(0,0,0,.28)"></ellipse><circle cx="67" cy="34" r="16" fill="#f2c7a5" stroke="currentColor" stroke-width="2"></circle><path d="M46 69 Q67 52 88 69 L95 112 H39 Z" fill="currentColor" opacity=".9"></path><path d="M50 70 L31 98 M84 70 L102 98" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"></path><path d="M53 112 V124 M81 112 V124" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"></path>';
    var prop = {
      nurse: '<path d="M74 74 C104 72 105 104 80 103 C61 102 65 80 83 83" fill="none" stroke="#f6f7f9" stroke-width="2.5"></path><path d="M81 84 V75 M81 75 L88 70" fill="none" stroke="#f6f7f9" stroke-width="2.5" stroke-linecap="round"></path><path d="M50 22 H84 V31 H50 Z" fill="#f6f7f9" stroke="currentColor" stroke-width="2"></path><path d="M67 23 V30 M61 26.5 H73" stroke="currentColor" stroke-width="2"></path><circle cx="100" cy="42" r="20" fill="rgba(120,240,190,.15)" stroke="currentColor" stroke-width="1.5"></circle><path d="M92 42 H108 M100 34 V50" stroke="currentColor" stroke-width="3"></path>',
      teacher: '<rect x="108" y="19" width="58" height="43" rx="3" fill="#172b35" stroke="currentColor" stroke-width="2"></rect><text x="119" y="47" fill="#c9f56a" font-size="16" font-family="monospace" font-weight="900">ABC</text><path d="M99 91 L118 77 L135 91 L116 105 Z" fill="#ff9c63" stroke="#f6f7f9" stroke-width="2"></path><path d="M109 85 L118 91 L127 85" fill="none" stroke="#f6f7f9" stroke-width="1.5"></path>',
      developer: '<rect x="105" y="61" width="62" height="38" rx="4" fill="#172b35" stroke="currentColor" stroke-width="2"></rect><path d="M96 103 H176 L167 111 H105 Z" fill="#74c8ff" stroke="currentColor" stroke-width="2"></path><text x="116" y="85" fill="#74c8ff" font-size="15" font-family="monospace" font-weight="900">&lt;/&gt;</text><path d="M51 20 Q67 8 83 20" fill="none" stroke="#74c8ff" stroke-width="5"></path>',
      electrician: '<path d="M50 23 Q67 7 84 23 V29 H50 Z" fill="#ff9c63" stroke="currentColor" stroke-width="2"></path><path d="M66 70 L78 87 L68 87 L77 105 L56 82 L66 82 Z" fill="#ff9c63" stroke="#f6f7f9" stroke-width="2"></path><path d="M107 32 L125 48 L107 64" fill="none" stroke="#ff9c63" stroke-width="4" stroke-linecap="round"></path>',
      mechanic: '<path d="M48 24 Q67 8 86 24 L82 34 H52 Z" fill="#ff9c63" stroke="currentColor" stroke-width="2"></path><path d="M105 31 L137 63 M132 31 L102 63" stroke="#f6f7f9" stroke-width="6" stroke-linecap="round"></path><circle cx="118" cy="47" r="22" fill="none" stroke="#ff9c63" stroke-width="3"></circle><path d="M123 77 H169 L174 99 H119 Z" fill="#172b35" stroke="currentColor" stroke-width="2"></path>',
      analyst: '<rect x="108" y="45" width="58" height="58" rx="4" fill="#172b35" stroke="currentColor" stroke-width="2"></rect><path d="M118 88 V74 M132 88 V62 M146 88 V70 M160 88 V53" stroke="#c9f56a" stroke-width="7" stroke-linecap="round"></path><path d="M101 25 L108 32 M102 32 L109 25" stroke="#f6f7f9" stroke-width="2"></path><path d="M48 33 H57 M77 33 H86" stroke="#f6f7f9" stroke-width="2"></path>',
      designer: '<circle cx="130" cy="65" r="25" fill="#172b35" stroke="currentColor" stroke-width="2"></circle><circle cx="119" cy="57" r="4" fill="#ff9c63"></circle><circle cx="132" cy="51" r="4" fill="#c9f56a"></circle><circle cx="143" cy="60" r="4" fill="#74c8ff"></circle><path d="M105 91 L158 31" stroke="#f3c86b" stroke-width="7" stroke-linecap="round"></path><path d="M104 93 L111 91" stroke="#f6f7f9" stroke-width="3"></path>',
      retail: '<path d="M111 51 H157 L163 104 H105 Z" fill="#172b35" stroke="currentColor" stroke-width="2"></path><path d="M121 52 C121 33 147 33 147 52" fill="none" stroke="#ff6f6f" stroke-width="4"></path><path d="M112 63 H157" stroke="#ff6f6f" stroke-width="2"></path>',
      fallback: '<circle cx="128" cy="59" r="23" fill="rgba(201,245,106,.13)" stroke="currentColor" stroke-width="2"></circle><text x="113" y="66" fill="#c9f56a" font-size="17" font-family="monospace" font-weight="900">✦</text>'
    };
    return '<svg viewBox="0 0 180 130" role="img" aria-label="Illustration of a ' + escapeHtml(career.name) + '">' + figure + (prop[career.id] || prop.fallback) + '</svg>';
  }

  function renderCareerVisual(career) {
    var visual = $('#home-career-visual');
    if (!visual) return;
    visual.innerHTML = careerVisualMarkup(career);
  }

  function blueprintFurnitureMarkup(room) {
    var x = room.x;
    var y = room.y;
    var w = room.w;
    var h = room.h;
    var right = x + w;
    var bottom = y + h;
    if (room.category === 'housing') {
      var bedX = Math.max(x + 78, right - 98);
      var bedY = y + Math.max(55, h - 58);
      return '<g class="blueprint-furniture"><rect x="' + bedX + '" y="' + bedY + '" width="78" height="39" rx="3"></rect><path d="M ' + bedX + ' ' + (bedY + 12) + ' H ' + (bedX + 78) + ' M ' + (bedX + 22) + ' V ' + (bedY + 39) + ' M ' + (bedX + 56) + ' V ' + (bedY + 39) + '"></path><rect class="blueprint-pillow" x="' + (bedX + 7) + '" y="' + (bedY + 5) + '" width="17" height="9" rx="2"></rect></g>';
    }
    if (room.category === 'lifestyle') {
      var sofaX = Math.max(x + 70, right - 112);
      var sofaY = bottom - 58;
      return '<g class="blueprint-furniture"><rect x="' + sofaX + '" y="' + sofaY + '" width="88" height="27" rx="7"></rect><path d="M ' + (sofaX + 8) + ' ' + (sofaY + 27) + ' V ' + (sofaY + 35) + ' M ' + (sofaX + 80) + ' ' + (sofaY + 27) + ' V ' + (sofaY + 35) + '"></path><rect class="blueprint-pillow" x="' + (sofaX + 12) + '" y="' + (sofaY + 6) + '" width="13" height="10" rx="2"></rect><rect x="' + (sofaX + 28) + '" y="' + (sofaY + 41) + '" width="32" height="10" rx="2"></rect></g>';
    }
    if (room.category === 'food') {
      var counterX = right - 104;
      var counterY = y + 9;
      return '<g class="blueprint-furniture"><rect x="' + counterX + '" y="' + counterY + '" width="88" height="25" rx="3"></rect><circle cx="' + (counterX + 23) + '" cy="' + (counterY + 12) + '" r="6"></circle><path d="M ' + (counterX + 48) + ' ' + (counterY + 7) + ' H ' + (counterX + 75) + ' M ' + (counterX + 48) + ' ' + (counterY + 17) + ' H ' + (counterX + 75) + '"></path></g>';
    }
    if (room.category === 'health') {
      var fixtureX = right - 86;
      var fixtureY = y + 20;
      return '<g class="blueprint-furniture"><rect x="' + fixtureX + '" y="' + fixtureY + '" width="48" height="20" rx="8"></rect><path d="M ' + (fixtureX + 7) + ' ' + (fixtureY + 20) + ' V ' + (fixtureY + 28) + ' H ' + (fixtureX + 40) + ' V ' + (fixtureY + 20) + '"></path><circle cx="' + (fixtureX + 69) + '" cy="' + (fixtureY + 24) + '" r="11"></circle><path d="M ' + (fixtureX + 62) + ' ' + (fixtureY + 24) + ' H ' + (fixtureX + 76) + '"></path></g>';
    }
    if (room.category === 'utilities') {
      var unitX = right - 68;
      var unitY = y + 24;
      return '<g class="blueprint-furniture"><rect x="' + unitX + '" y="' + unitY + '" width="42" height="61" rx="3"></rect><circle cx="' + (unitX + 21) + '" cy="' + (unitY + 19) + '" r="10"></circle><circle cx="' + (unitX + 21) + '" cy="' + (unitY + 45) + '" r="10"></circle></g>';
    }
    if (room.category === 'transport') {
      var carX = right - 83;
      var carY = y + 7;
      return '<g class="blueprint-furniture"><path d="M ' + (carX + 10) + ' ' + (carY + 20) + ' L ' + (carX + 18) + ' ' + (carY + 7) + ' H ' + (carX + 58) + ' L ' + (carX + 70) + ' ' + (carY + 20) + ' V ' + (carY + 32) + ' H ' + (carX + 6) + ' V ' + (carY + 20) + ' Z"></path><circle cx="' + (carX + 19) + '" cy="' + (carY + 32) + '" r="5"></circle><circle cx="' + (carX + 58) + '" cy="' + (carY + 32) + '" r="5"></circle></g>';
    }
    return '';
  }

  function blueprintRoomMarkup(result, room) {
    var row = houseRow(result, room.category);
    var compact = room.h < 62;
    var amount = room.category === 'housing' ? (room.primaryHousing ? money(result.housingCost) + ' / mo' : 'included in rent') : money(row.value);
    var profile = result.housingProfile;
    var profileShort = (profile.bedrooms === 0 ? 'studio' : profile.bedrooms + ' bd') + ' · ' + profile.bathrooms + ' bath · ' + Number(profile.sqft).toLocaleString('en-US') + ' sq ft';
    var share = room.category === 'housing' ? (room.primaryHousing ? percent(result.housingCost / result.takeHome) + ' of take-home' : profileShort) : percent(row.value / result.monthlyBudget) + ' of plan';
    var label = escapeHtml(room.label);
    var aria = escapeHtml(room.label + ' · ' + amount + ' · ' + share);
    return '<g class="blueprint-room' + (compact ? ' compact' : '') + (room.category === activeHomeHouseCategory ? ' active' : '') + '" data-house-category="' + room.category + '" role="button" tabindex="0" aria-pressed="' + (room.category === activeHomeHouseCategory ? 'true' : 'false') + '" aria-label="' + aria + '"><title>' + aria + '</title><rect class="blueprint-room-surface" x="' + room.x + '" y="' + room.y + '" width="' + room.w + '" height="' + room.h + '" rx="6"></rect>' + blueprintFurnitureMarkup(room) + '<text class="blueprint-room-label" x="' + (room.x + 14) + '" y="' + (room.y + (compact ? 17 : 25)) + '">' + label + '</text><text class="blueprint-room-value" x="' + (room.x + 14) + '" y="' + (room.y + (compact ? 32 : 48)) + '">' + escapeHtml(amount) + '</text>' + (compact ? '' : '<text class="blueprint-room-share" x="' + (room.x + 14) + '" y="' + (room.y + 65) + '">' + escapeHtml(share) + '</text>') + '</g>';
  }

  function blueprintLayout(result) {
    var garage = { category: 'transport', label: 'Garage · commute', x: 535, y: 330, w: 170, h: 39 };
    var layouts = {
      studio: [
        { category: 'lifestyle', label: 'Open living / sleep', x: 55, y: 62, w: 365, h: 205 },
        { category: 'food', label: 'Kitchen · food', x: 55, y: 277, w: 365, h: 55 },
        { category: 'health', label: 'Bathroom · health', x: 440, y: 62, w: 265, h: 125 },
        { category: 'utilities', label: 'Utility / energy', x: 440, y: 197, w: 265, h: 135 },
        garage
      ],
      'one-bedroom': [
        { category: 'lifestyle', label: 'Living room · other', x: 55, y: 62, w: 300, h: 205 },
        { category: 'food', label: 'Kitchen · food', x: 55, y: 277, w: 300, h: 55 },
        { category: 'housing', label: 'Bedroom 1', x: 375, y: 62, w: 330, h: 125 },
        { category: 'health', label: 'Bathroom · health', x: 375, y: 197, w: 155, h: 135 },
        { category: 'utilities', label: 'Utility / energy', x: 550, y: 197, w: 155, h: 135 },
        garage
      ],
      'two-bedroom': [
        { category: 'lifestyle', label: 'Living room · other', x: 55, y: 62, w: 300, h: 175 },
        { category: 'food', label: 'Kitchen · food', x: 55, y: 247, w: 300, h: 85 },
        { category: 'housing', label: 'Bedroom 1', x: 375, y: 62, w: 155, h: 125 },
        { category: 'housing', label: 'Bedroom 2', x: 550, y: 62, w: 155, h: 125 },
        { category: 'health', label: 'Bathroom · health', x: 375, y: 197, w: 155, h: 135 },
        { category: 'utilities', label: 'Utility / energy', x: 550, y: 197, w: 155, h: 135 },
        garage
      ],
      'three-bedroom': [
        { category: 'lifestyle', label: 'Living room · other', x: 55, y: 62, w: 250, h: 155 },
        { category: 'food', label: 'Kitchen · food', x: 55, y: 227, w: 250, h: 105 },
        { category: 'housing', label: 'Bedroom 1', x: 325, y: 62, w: 175, h: 125 },
        { category: 'housing', label: 'Bedroom 2', x: 520, y: 62, w: 185, h: 125 },
        { category: 'housing', label: 'Bedroom 3', x: 325, y: 197, w: 175, h: 135 },
        { category: 'health', label: 'Bathroom · health', x: 520, y: 197, w: 185, h: 135 },
        garage
      ]
    };
    return layouts[result.housingProfile.id] || layouts['one-bedroom'];
  }

  function renderHouseBlueprint(result) {
    var drawing = $('#home-house-drawing');
    if (!drawing) return;
    var rooms = blueprintLayout(result);
    var housingPlaced = false;
    var roomMarkup = rooms.map(function (room) {
      var primaryHousing = room.category === 'housing' && !housingPlaced;
      if (primaryHousing) housingPlaced = true;
      return blueprintRoomMarkup(result, { category: room.category, label: room.label, x: room.x + 20, y: room.y + 70, w: room.w, h: room.h, primaryHousing: primaryHousing });
    }).join('');
    var profileLabel = housingSpec(result.housingProfile);
    var rentShare = result.takeHome ? percent(result.housingCost / result.takeHome) : '—';
    var rentBadge = '<g class="blueprint-rent-badge' + (activeHomeHouseCategory === 'housing' ? ' active' : '') + '" data-house-category="housing" role="button" tabindex="0" aria-pressed="' + (activeHomeHouseCategory === 'housing' ? 'true' : 'false') + '" aria-label="Housing rent · ' + escapeHtml(money(result.housingCost)) + ' per month · ' + escapeHtml(rentShare) + ' of take-home pay"><rect x="260" y="66" width="280" height="59" rx="8"></rect><text class="blueprint-rent-label" x="400" y="83" text-anchor="middle">ROOF · RENT / HOUSING</text><text class="blueprint-rent-value" x="400" y="104" text-anchor="middle">' + escapeHtml(money(result.housingCost)) + ' / MONTH</text><text class="blueprint-rent-share" x="400" y="117" text-anchor="middle">' + escapeHtml(rentShare + ' of take-home pay') + '</text></g>';
    var architecturalMarkup = '<g class="blueprint-architecture"><path class="blueprint-roof-line" d="M 34 145 L 400 25 L 766 145"></path><path class="blueprint-wall-edge" d="M 60 132 H 740 M 60 438 H 740"></path><path class="blueprint-door-swing" d="M 375 405 A 50 50 0 0 1 425 355"></path><path class="blueprint-garage-door" d="M 595 405 H 720 M 595 413 H 720 M 595 421 H 720 M 595 429 H 720"></path><path class="blueprint-window-cross" d="M 78 174 V 208 M 69 191 H 87 M 712 174 V 208 M 703 191 H 721 M 173 132 V 147 M 164 139 H 182 M 640 132 V 147 M 631 139 H 649"></path><path class="blueprint-porch" d="M 350 438 H 450 V 454 H 350 Z"></path></g>';
    drawing.innerHTML = '<svg viewBox="0 0 800 475" role="img" aria-label="' + escapeHtml(profileLabel + ' interactive floor plan') + '"><defs><pattern id="blueprint-grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(116,200,255,.13)" stroke-width="1"></path></pattern></defs><rect class="blueprint-grid" width="800" height="475"></rect><text class="blueprint-home-title" x="24" y="24">' + escapeHtml(result.housingProfile.bedrooms === 0 ? 'STUDIO HOUSE PLAN' : result.housingProfile.bedrooms + ' BEDROOM HOUSE PLAN') + '</text><text class="blueprint-home-note" x="24" y="42">Roof = rent · rooms = monthly costs · front door = room left</text><path class="blueprint-roof-shape" d="M 34 145 L 400 25 L 766 145 Z"></path>' + rentBadge + '<path class="blueprint-house-body" d="M 60 132 H 740 V 438 H 60 Z"></path><path class="blueprint-chimney" d="M 610 82 V 34 H 653 V 95"></path>' + roomMarkup + architecturalMarkup + '<rect class="blueprint-front-door" x="375" y="405" width="50" height="33" rx="4"></rect><circle class="blueprint-door-knob" cx="414" cy="422" r="3"></circle><path class="blueprint-driveway" d="M 620 438 L 594 466 H 746 L 720 438"></path><text class="blueprint-front-label" x="382" y="457">FRONT DOOR</text><text class="blueprint-home-note" x="602" y="471">garage / commute</text></svg>';
    setText('#home-house-type', result.housingProfile.bedrooms === 0 ? 'STUDIO HOME' : result.housingProfile.bedrooms + ' BEDROOM HOME');
    setText('#home-house-profile', profileLabel);
    setText('#home-house-savings-value', money(houseRow(result, 'savings').value) + ' / mo');
    setText('#home-house-savings-share', percent(houseRow(result, 'savings').value / result.monthlyBudget) + ' of plan');
    drawing.classList.remove('house-swap-in');
    void drawing.offsetWidth;
    drawing.classList.add('house-swap-in');
    var clickTargets = $all('.blueprint-room', drawing);
    var rentTarget = $('.blueprint-rent-badge', drawing);
    if (rentTarget) clickTargets.push(rentTarget);
    var foundation = $('.blueprint-foundation-room');
    if (foundation) clickTargets.push(foundation);
    clickTargets.forEach(function (target) {
      var category = target.getAttribute('data-house-category');
      target.classList.toggle('active', category === activeHomeHouseCategory);
      target.setAttribute('aria-pressed', category === activeHomeHouseCategory ? 'true' : 'false');
      target.onclick = function () {
        activeHomeHouseCategory = category;
        renderHomeHouse(result);
      };
      target.onkeydown = function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activeHomeHouseCategory = category;
          renderHomeHouse(result);
        }
      };
    });
  }

  function renderHomeHouse(result) {
    if (!$('#house-lab-title')) return;
    var roomLabels = { housing: 'Housing', food: 'Food', transport: 'Transportation', health: 'Health care', utilities: 'Utilities', lifestyle: 'Other life costs', savings: 'Savings target' };
    var roomCopy = {
      housing: 'Housing costs ' + money(result.housingCost) + ' per month, or ' + percent(result.housingCost / result.takeHome) + ' of take-home pay. A move between states changes this number before the rest of the plan is considered.',
      food: 'Food takes ' + money(houseRow(result, 'food').value) + ' each month in this plan. Household size and the local price level move this room more than the career itself.',
      transport: 'Transportation takes ' + money(houseRow(result, 'transport').value) + ' per month. A lower-rent state is not automatically cheaper if getting to work costs more.',
      health: 'Health care is modeled at ' + money(houseRow(result, 'health').value) + ' per month. It is part of the basic-life plan even though it is easy to overlook in a salary comparison.',
      utilities: 'Utilities take ' + money(houseRow(result, 'utilities').value) + ' per month. This category follows the home profile and local prices, so a larger home can increase pressure even when rent is unchanged.',
      lifestyle: 'Other life costs combine everyday needs, personal spending, and childcare when the household includes children. In this scenario that bundle uses ' + money(houseRow(result, 'lifestyle').value) + ' each month.',
      savings: 'The foundation sets aside ' + money(houseRow(result, 'savings').value) + ' per month. A paycheck can cover the bills and still feel fragile if no room remains for shocks or goals.'
    };
    var character = $('#home-career-character');
    if (character) {
      character.setAttribute('data-career-id', result.career.id);
      character.classList.remove('scenario-update');
      void character.offsetWidth;
      character.classList.add('scenario-update');
    }
    renderCareerVisual(result.career);
    setText('#home-career-role', result.career.name);
    setText('#home-career-family', result.career.family + ' · median salary lens');
    var careerProp = $('#home-career-prop');
    if (careerProp) careerProp.innerHTML = careerIconMarkup(result.career);
    setText('#home-house-label', result.career.name + ' · ' + result.state.name);
    setText('#home-house-gross', money(result.salary / 12));
    setText('#home-house-tax', '−' + money(result.salary / 12 - result.takeHome));
    setText('#home-house-take-home', money(result.takeHome) + ' / mo');
    setText('#home-house-budget', money(result.monthlyBudget));
    setText('#home-house-leftover', signedMoney(result.leftover));
    var fill = $('#home-house-budget-fill');
    if (fill) fill.style.width = clamp(result.monthlyBudget / result.takeHome * 100, 0, 100) + '%';
    renderHouseBlueprint(result);
    var pressure = result.rows.filter(function (item) { return item.value > 0 && item.key !== 'savings'; }).sort(function (a, b) { return b.value - a.value; })[0] || houseRow(result, 'housing');
    setText('#home-house-analysis-title', roomLabels[activeHomeHouseCategory] + ' enters the picture.');
    setText('#home-house-analysis-copy', roomCopy[activeHomeHouseCategory]);
    setText('#home-house-analysis-label', 'Largest modeled cost');
    setText('#home-house-analysis-value', pressure.label + ' · ' + money(pressure.value));
    setText('#home-house-analysis-note', result.leftover >= 0 ? 'After the full plan, this scenario keeps ' + money(result.leftover) + ' of monthly breathing room.' : 'After the full plan, this scenario has a ' + money(Math.abs(result.leftover)) + ' monthly gap to close.');
    setText('#home-house-budget-caption', 'The roof is the housing cost: ' + money(result.housingCost) + ' per month (' + percent(result.housingCost / result.takeHome) + ' of take-home pay). The door shows ' + signedMoney(result.leftover) + ' after the full ' + money(result.monthlyBudget) + ' monthly plan. Click another room to isolate its effect.');
    setText('#home-house-reading-copy', 'Read the house from top to bottom: the roof is rent, the rooms are monthly cost categories, the foundation is the savings target, and the front door is the income still available after the plan.');
    var canvas = $('#home-house-canvas');
    if (canvas) {
      canvas.setAttribute('data-home-profile', result.housingProfile.id);
      canvas.setAttribute('data-pressure', result.leftover < 0 ? 'gap' : result.ratio < 1.2 ? 'strained' : 'comfortable');
      canvas.classList.remove('scenario-update');
      void canvas.offsetWidth;
      canvas.classList.add('scenario-update');
    }
    var arrival = $('#home-career-arrival');
    if (arrival) {
      arrival.classList.remove('scenario-update');
      void arrival.offsetWidth;
      arrival.classList.add('scenario-update');
    }
  }

  function renderTable(result, comparison) {
    var scenarios = [result, comparison];
    var ranked = DATA.states.map(function (state) {
      return calculate({ careerId: result.career.id, stateCode: state.code, year: result.year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    }).sort(function (a, b) { return b.ratio - a.ratio; });
    ranked.slice(0, 3).forEach(function (item) {
      if (!scenarios.some(function (existing) { return existing.state.code === item.state.code; })) scenarios.push(item);
    });
    $('#scenario-table tbody').innerHTML = scenarios.map(function (item) {
      return '<tr><td><strong>' + item.state.name + '</strong></td><td>' + item.housingProfile.label + '</td><td>' + money(item.housingCost) + '</td><td>' + compactMoney(item.salary) + '</td><td>' + money(item.takeHome) + '</td><td>' + money(item.essentials) + '</td><td class="' + (item.leftover >= 0 ? 'positive' : 'negative') + '">' + signedMoney(item.leftover) + '</td><td>' + ratio(item.ratio) + '</td><td>' + percent(item.housingShare) + '</td></tr>';
    }).join('');
    latestRows = scenarios;
  }

  function renderDashboard() {
    var options = optionsFromControls();
    var result = calculate(options);
    var comparison = calculate({
      careerId: options.careerId,
      stateCode: $('#compare-state-select').value,
      year: options.year,
      householdId: options.householdId,
      percentileKey: options.percentileKey,
      modeId: options.modeId,
      housingId: options.housingId,
      customSalary: options.customSalary
    });
    setText('#active-model-label', result.mode.name);
    setText('#active-model-note', result.mode.description);
    setText('#result-title', result.state.name + ' · ' + result.career.name);
    setText('#result-subtitle', result.household.name + ' · ' + (result.customSalary ? 'Custom salary' : result.percentile.label) + ' · ' + result.year);
    setText('#result-badge', result.leftover >= 0 ? 'SURPLUS' : 'SHORTFALL');
    setText('#leftover-value', signedMoney(result.leftover));
    setText('#leftover-note', result.leftover >= 0 ? 'after the selected model' : 'monthly gap in the selected model');
    setText('#break-even-value', compactMoney(result.requiredGross));
    setText('#housing-share-value', percent(result.housingShare));
    renderKpis(result);
    renderGauge(result);
    if ($('#map-year-scrubber')) $('#map-year-scrubber').value = result.year;
    setText('#map-year-label', String(result.year));
    renderMap(result);
    renderHousingLens(result, comparison);
    renderComparison(result, comparison);
    renderWaterfall(result);
    renderDrivers(result);
    renderRanked(result);
    renderCpiLens(result, $('#dashboard-trend'));
    renderTable(result, comparison);
  }

  function csvDownload() {
    var header = ['Location', 'Home', 'Rent / month', 'Salary', 'Take-home / month', 'Essentials / month', 'Leftover / month', 'Ratio', 'Housing share'];
    var lines = [header.join(',')].concat(latestRows.map(function (item) {
      return [item.state.name, item.housingProfile.label, Math.round(item.housingCost), Math.round(item.salary), Math.round(item.takeHome), Math.round(item.essentials), Math.round(item.leftover), item.ratio.toFixed(2), percent(item.housingShare)].join(',');
    }));
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'paycheck-atlas-scenario.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function initDashboard() {
    selectOptions($('#career-select'), DATA.careers, 'id', function (item) { return item.name; });
    selectOptions($('#state-select'), DATA.states, 'code', function (item) { return item.name; });
    selectOptions($('#compare-state-select'), DATA.states, 'code', function (item) { return item.name; });
    selectOptions($('#year-select'), DATA.years.slice().reverse().map(function (year) { return { value: year }; }), 'value', function (item) { return String(item.value); });
    selectOptions($('#household-select'), DATA.households, 'id', function (item) { return item.name; });
    selectOptions($('#housing-select'), DATA.housing, 'id', function (item) { return item.label; });
    selectOptions($('#percentile-select'), Object.keys(DATA.percentiles).map(function (key) { return { id: key, label: DATA.percentiles[key].label }; }), 'id', function (item) { return item.label; });
    selectOptions($('#mode-select'), DATA.modes, 'id', function (item) { return item.name; });
    $('#career-select').value = 'nurse';
    $('#state-select').value = 'TX';
    $('#compare-state-select').value = 'CA';
    $('#year-select').value = String(latestYear());
    $('#household-select').value = 'solo';
    $('#housing-select').value = 'one-bedroom';
    $('#percentile-select').value = 'median';
    $('#mode-select').value = 'balanced';
    $all('#career-select, #state-select, #compare-state-select, #year-select, #household-select, #housing-select, #percentile-select, #mode-select, #custom-salary, #rank-measure').forEach(function (element) {
      element.addEventListener('input', renderDashboard);
      element.addEventListener('change', renderDashboard);
    });
    $('#map-measure').addEventListener('change', renderDashboard);
    $('#map-zoom-out').addEventListener('click', function () { setMapZoom(mapZoom - 0.15); });
    $('#map-zoom-reset').addEventListener('click', function () { setMapZoom(1); });
    $('#map-zoom-in').addEventListener('click', function () { setMapZoom(mapZoom + 0.15); });
    $('#map-year-scrubber').min = String(DATA.years[0]);
    $('#map-year-scrubber').max = String(latestYear());
    $('#map-year-scrubber').value = String(latestYear());
    $('#map-year-scrubber').addEventListener('input', function () {
      $('#year-select').value = $('#map-year-scrubber').value;
      renderDashboard();
    });
    $all('[data-rank-direction]').forEach(function (button) {
      button.addEventListener('click', function () {
        currentRankDirection = button.getAttribute('data-rank-direction');
        $all('[data-rank-direction]').forEach(function (item) { item.classList.toggle('active', item === button); });
        renderDashboard();
      });
    });
    $('#map-compare-button').addEventListener('click', function () {
      if (mapFocusedStateCode) {
        $('#compare-state-select').value = mapFocusedStateCode;
        renderDashboard();
      }
    });
    $all('[data-chart-measure]').forEach(function (button) {
      button.addEventListener('click', function () {
        currentChartMeasure = button.getAttribute('data-chart-measure');
        $all('[data-chart-measure]').forEach(function (item) { item.classList.toggle('active', item === button); });
        renderDashboard();
      });
    });
    $('#reset-dashboard').addEventListener('click', function () {
      $('#career-select').value = 'nurse';
      $('#state-select').value = 'TX';
      $('#compare-state-select').value = 'CA';
      $('#year-select').value = String(latestYear());
      $('#household-select').value = 'solo';
      $('#housing-select').value = 'one-bedroom';
      $('#percentile-select').value = 'median';
      $('#mode-select').value = 'balanced';
      $('#custom-salary').value = '';
      $('#rank-measure').value = 'ratio';
      currentRankDirection = 'top';
      $all('[data-rank-direction]').forEach(function (item) { item.classList.toggle('active', item.getAttribute('data-rank-direction') === 'top'); });
      renderDashboard();
    });
    $('#download-scenario').addEventListener('click', csvDownload);
    var dialog = $('#assumptions-dialog');
    $('#assumptions-open').addEventListener('click', function () { dialog.showModal(); });
    $('#assumptions-close').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
    renderDashboard();
  }

  function renderHomeScenario(result) {
    var values = DATA.states.map(function (state) {
      return calculate({ careerId: result.career.id, stateCode: state.code, year: result.year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    });
    var best = values.slice().sort(function (a, b) { return b.ratio - a.ratio; })[0];
    var worst = values.slice().sort(function (a, b) { return a.ratio - b.ratio; })[0];
    var spread = best.leftover - worst.leftover;
    setText('#home-tradeoff-context', result.career.name + ' · ' + result.household.name + ' · ' + result.housingProfile.label + ' · ' + result.year + ' · all states');
    setText('#home-spread-value', money(spread));
    setText('#home-spread-label', best.state.name + ' leaves ' + money(spread) + ' more each month than ' + worst.state.name + ' under the same ' + result.career.name.toLowerCase() + ', ' + result.household.name.toLowerCase() + ', and ' + result.housingProfile.label.toLowerCase() + ' scenario.');
    $('#home-metrics').innerHTML = [
      ['Best modeled ratio', ratio(best.ratio), best.state.name + ' · ' + result.career.name],
      ['Breathing-room spread', money(spread), 'best vs. tightest state'],
      ['Housing share', percent(result.housingShare), 'of ' + result.state.name + ' essentials in this scenario'],
      ['States in prototype', String(DATA.states.length), 'same lens across all states']
    ].map(function (card) {
      return '<article class="metric-card"><span class="metric-label">' + card[0] + '</span><strong class="metric-value">' + card[1] + '</strong><span class="metric-note">' + card[2] + '</span></article>';
    }).join('');
    var ranked = values.slice().sort(function (a, b) { return b.ratio - a.ratio; }).slice(0, 5);
    var maxRatio = ranked[0].ratio;
    $('#home-ranking').innerHTML = ranked.map(function (item) {
      return '<div class="state-bar-row"><span class="state-name">' + item.state.name + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (item.ratio / maxRatio * 100) + '%"></div></div><span class="bar-value">' + ratio(item.ratio) + '</span></div>';
    }).join('');
    var flow = result.rows.filter(function (item) { return ['housing', 'food', 'transport'].indexOf(item.key) !== -1; });
    var other = result.monthlyBudget - flow.reduce(function (sum, item) { return sum + item.value; }, 0);
    flow.push({ key: 'other', value: other, className: 'other' });
    $('#home-flow').innerHTML = flow.map(function (item) {
      return '<div class="flow-segment ' + item.className + '" style="width:' + (item.value / result.monthlyBudget * 100) + '%" title="' + item.key + ': ' + money(item.value) + '"></div>';
    }).join('');
    var largest = result.rows.filter(function (item) { return item.value > 0 && item.key !== 'savings'; }).sort(function (a, b) { return b.value - a.value; })[0];
    setText('#home-ranking-analysis', 'Under this lens, ' + best.state.name + ' gives the strongest ratio while ' + worst.state.name + ' is tightest. The gap is driven by the interaction between local costs and the wage attached to ' + result.career.name.toLowerCase() + '.');
    setText('#home-flow-analysis', largest.label + ' is the largest modeled pressure point at ' + money(largest.value) + ' per month. The full plan uses ' + percent(result.monthlyBudget / result.takeHome) + ' of take-home pay, leaving ' + signedMoney(result.leftover) + '.');
    renderCpiLens(result, $('#home-trend'));
  }

  function evidenceRowMarkup(label, value, valueLabel, maxValue, className) {
    var safeValue = Math.max(0, Number(value) || 0);
    var width = clamp((safeValue / (maxValue || 1)) * 100, 4, 100);
    return '<div class="evidence-row ' + (className || '') + '"><div class="evidence-row-top"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(valueLabel) + '</strong></div><div class="evidence-row-track"><i style="width:' + width + '%"></i></div></div>';
  }

  function renderReportEvidence(result, comparison) {
    var states = DATA.states.map(function (state) {
      return calculate({ careerId: result.career.id, stateCode: state.code, year: result.year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    });
    var ranked = states.slice().sort(function (a, b) { return b.ratio - a.ratio; });
    var best = ranked[0];
    var worst = ranked[ranked.length - 1];
    var topLocation = ranked.slice(0, 4).concat([worst]);
    var maxRatio = Math.max.apply(null, topLocation.map(function (item) { return item.ratio; }));
    $('#report-location-chart').innerHTML = topLocation.map(function (item, index) {
      return evidenceRowMarkup((index === topLocation.length - 1 ? 'Tightest · ' : '') + item.state.name, item.ratio, ratio(item.ratio), maxRatio, index === 0 ? 'is-leading' : '');
    }).join('');
    setText('#report-location-copy', best.state.name + ' ranks first at ' + ratio(best.ratio) + ', while ' + worst.state.name + ' ranks last at ' + ratio(worst.ratio) + '. That is a ' + money(best.leftover - worst.leftover) + ' monthly breathing-room spread under the same career and home lens.');

    var expenseRows = result.rows.filter(function (item) { return item.value > 0 && item.key !== 'savings'; }).sort(function (a, b) { return b.value - a.value; });
    var largestExpense = expenseRows[0];
    var maxExpense = expenseRows[0] ? expenseRows[0].value : 1;
    $('#report-expense-chart').innerHTML = expenseRows.slice(0, 5).map(function (item) {
      return evidenceRowMarkup(item.label, item.value, money(item.value) + ' / mo', maxExpense, item.key === largestExpense.key ? 'is-leading' : '');
    }).join('');
    setText('#report-expense-copy', largestExpense.label + ' is the largest modeled pressure at ' + money(largestExpense.value) + ' per month, or ' + percent(largestExpense.value / result.monthlyBudget) + ' of the full plan.');

    var homeMaxRent = Math.max(result.housingCost, comparison.housingCost);
    $('#report-home-chart').innerHTML = evidenceRowMarkup(result.state.name + ' · ' + result.housingProfile.label, result.housingCost, money(result.housingCost) + ' rent', homeMaxRent, 'is-leading') + evidenceRowMarkup(comparison.state.name + ' · same home', comparison.housingCost, money(comparison.housingCost) + ' rent', homeMaxRent, 'is-compare');
    setText('#report-home-copy', 'The same ' + result.housingProfile.label.toLowerCase() + ' costs ' + money(Math.abs(result.housingCost - comparison.housingCost)) + ' more per month in ' + (result.housingCost >= comparison.housingCost ? result.state.name : comparison.state.name) + '. The address changes; the home profile does not.');

    var essentials = result.essentials;
    var planPieces = [
      { label: 'Essentials', value: essentials, className: 'route-essential' },
      { label: 'Personal spending', value: result.mode.discretionary * result.priceFactor * cpiFactor(result.year, 'other'), className: 'route-discretionary' },
      { label: 'Savings target', value: result.mode.savings, className: 'route-savings' }
    ];
    var routeTotal = Math.max(result.takeHome, result.monthlyBudget, 1);
    $('#report-route-chart').innerHTML = planPieces.map(function (item) {
      return '<div class="route-piece ' + item.className + '" style="width:' + clamp(item.value / routeTotal * 100, 0, 100) + '%"><span>' + escapeHtml(item.label) + '</span><strong>' + money(item.value) + '</strong></div>';
    }).join('') + '<div class="route-leftover ' + (result.leftover < 0 ? 'is-gap' : '') + '" style="width:' + clamp(Math.abs(result.leftover) / routeTotal * 100, 0, 100) + '%"><span>' + (result.leftover < 0 ? 'Gap' : 'Room left') + '</span><strong>' + signedMoney(result.leftover) + '</strong></div>';
    setText('#report-route-copy', money(result.takeHome) + ' of monthly take-home enters the plan. ' + (result.leftover >= 0 ? money(result.leftover) + ' remains after the modeled costs and goals.' : 'The modeled plan runs ' + money(Math.abs(result.leftover)) + ' above take-home pay.'));

    var salaryLenses = ['lower', 'median', 'upper'].map(function (key) {
      return { key: key, label: DATA.percentiles[key].label, item: calculate({ careerId: result.career.id, stateCode: result.state.code, year: result.year, householdId: result.household.id, percentileKey: key, modeId: result.mode.id, housingId: result.housingId }) };
    });
    var maxSalaryRatio = Math.max.apply(null, salaryLenses.map(function (item) { return item.item.ratio; }));
    $('#report-salary-chart').innerHTML = salaryLenses.map(function (item) {
      return evidenceRowMarkup(item.label, item.item.ratio, ratio(item.item.ratio), maxSalaryRatio, item.key === result.percentileKey ? 'is-leading' : '');
    }).join('');
    setText('#report-salary-copy', 'At the selected state, moving from the 25th to the 75th percentile changes room left from ' + signedMoney(salaryLenses[0].item.leftover) + ' to ' + signedMoney(salaryLenses[2].item.leftover) + ' per month.');

    var householdLenses = DATA.households.map(function (household) {
      return { household: household, item: calculate({ careerId: result.career.id, stateCode: result.state.code, year: result.year, householdId: household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId }) };
    });
    var maxHouseholdRatio = Math.max.apply(null, householdLenses.map(function (item) { return item.item.ratio; }));
    $('#report-household-chart').innerHTML = householdLenses.map(function (item) {
      return evidenceRowMarkup(item.household.name, item.item.ratio, ratio(item.item.ratio), maxHouseholdRatio, item.household.id === result.household.id ? 'is-leading' : '');
    }).join('');
    var hardestHousehold = householdLenses.slice().sort(function (a, b) { return a.item.ratio - b.item.ratio; })[0];
    setText('#report-household-copy', 'The ' + hardestHousehold.household.name.toLowerCase() + ' scenario is the tightest at ' + ratio(hardestHousehold.item.ratio) + '. Household composition can move the result even when the job, state, year, and housing profile stay fixed.');

    var first = calculate({ careerId: result.career.id, stateCode: result.state.code, year: DATA.years[0], householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    var last = calculate({ careerId: result.career.id, stateCode: result.state.code, year: latestYear(), householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    var payGrowth = (last.takeHome / first.takeHome - 1) * 100;
    var costGrowth = (last.monthlyBudget / first.monthlyBudget - 1) * 100;
    var maxGrowth = Math.max(payGrowth, costGrowth, 1);
    $('#report-time-chart').innerHTML = evidenceRowMarkup('Take-home pay', payGrowth, '+' + Math.round(payGrowth) + '%', maxGrowth, 'is-leading') + evidenceRowMarkup('Basic-life plan', costGrowth, '+' + Math.round(costGrowth) + '%', maxGrowth, 'is-compare');
    setText('#report-time-copy', 'From ' + DATA.years[0] + ' to ' + latestYear() + ', take-home pay changes by ' + Math.round(payGrowth) + '% while the modeled plan changes by ' + Math.round(costGrowth) + '%. The larger line is the one putting more pressure on the house.');

    var thresholdRatio = result.salary / result.requiredGross;
    var thresholdWidth = clamp(thresholdRatio * 100, 3, 100);
    $('#report-threshold-chart').innerHTML = '<div class="threshold-track"><i style="width:' + thresholdWidth + '%"></i><span class="threshold-marker" style="left:100%"></span></div><div class="threshold-labels"><span>Current gross<br><strong>' + money(result.salary) + '</strong></span><span>Break-even target<br><strong>' + money(result.requiredGross) + '</strong></span></div>';
    setText('#report-threshold-copy', result.salary >= result.requiredGross ? 'This salary clears the modeled break-even target by ' + money(result.salary - result.requiredGross) + ' per year.' : 'This salary is ' + money(result.requiredGross - result.salary) + ' below the modeled break-even target for the selected plan.');
  }

  function renderHomeTimeMachine(result) {
    var slider = $('#home-time-scrubber');
    if (!slider) return;
    var year = Number(slider.value || latestYear());
    var timed = calculate({ careerId: result.career.id, stateCode: result.state.code, year: year, householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    var first = calculate({ careerId: result.career.id, stateCode: result.state.code, year: DATA.years[0], householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    var last = calculate({ careerId: result.career.id, stateCode: result.state.code, year: latestYear(), householdId: result.household.id, percentileKey: result.percentileKey, modeId: result.mode.id, housingId: result.housingId, customSalary: result.customSalary || '' });
    setText('#home-time-year', String(year));
    setText('#home-time-status', year === latestYear() ? 'LATEST PROTOTYPE YEAR' : result.state.name.toUpperCase() + ' · ' + result.career.name.toUpperCase());
    setText('#home-time-pay', money(timed.takeHome));
    setText('#home-time-cost', money(timed.monthlyBudget));
    setText('#home-time-leftover', signedMoney(timed.leftover));
    setText('#home-time-ratio', ratio(timed.ratio) + ' affordability ratio');
    setText('#home-time-house-leftover', signedMoney(timed.leftover));
    var house = $('#home-time-house');
    if (house) {
      house.setAttribute('data-pressure', timed.leftover < 0 ? 'gap' : timed.ratio < 1.2 ? 'strained' : 'comfortable');
      house.style.setProperty('--age', String((year - DATA.years[0]) / (latestYear() - DATA.years[0] || 1)));
    }
    setText('#home-time-house-caption', timed.leftover >= 0 ? 'The house stays above water with ' + money(timed.leftover) + ' left in ' + String(year) + '.' : 'The house shows pressure because the modeled plan is short by ' + money(Math.abs(timed.leftover)) + ' in ' + String(year) + '.');
    var payChange = Math.round((last.takeHome / first.takeHome - 1) * 100);
    var costChange = Math.round((last.monthlyBudget / first.monthlyBudget - 1) * 100);
    setText('#home-time-explanation', 'From ' + DATA.years[0] + ' to ' + latestYear() + ', this ' + result.career.name.toLowerCase() + ' scenario sees take-home pay change by ' + payChange + '% while the modeled basic-life plan changes by ' + costChange + '%. In ' + String(year) + ', the selected year leaves ' + signedMoney(timed.leftover) + ' after the plan.');
  }

  function renderCareerDeck(activeCareerId) {
    var deck = $('#home-career-deck');
    if (!deck) return;
    deck.innerHTML = DATA.careers.map(function (career) {
      return '<button class="career-card' + (career.id === activeCareerId ? ' active' : '') + '" type="button" data-career-id="' + escapeHtml(career.id) + '"><span class="career-card-icon">' + careerIconMarkup(career) + '</span><strong>' + escapeHtml(career.name) + '</strong><small>' + escapeHtml(career.family) + '</small><b>' + compactMoney(career.base) + ' / yr</b></button>';
    }).join('');
    $all('.career-card', deck).forEach(function (button) {
      button.addEventListener('click', function () {
        $('#home-career-select').value = button.getAttribute('data-career-id');
        renderHomePassport();
      });
    });
  }

  function renderHome() {
    var result = calculate({ careerId: 'nurse', stateCode: 'TX', year: latestYear(), householdId: 'solo', percentileKey: 'median', modeId: 'balanced', housingId: 'one-bedroom' });
    renderHomeScenario(result);
  }

  function renderHomeHero(scenario) {
    var heroIcon = $('#home-hero-icon');
    if (heroIcon) heroIcon.innerHTML = careerIconMarkup(scenario.career);
    setText('#home-hero-role', scenario.career.name);
    setText('#home-hero-location', scenario.state.name + ' · ' + scenario.household.name);
    $('#home-hero-take-home').innerHTML = money(scenario.takeHome) + '<span>/mo</span>';
    setText('#home-hero-take-home-row', money(scenario.takeHome));
    setText('#home-hero-budget', '−' + money(scenario.monthlyBudget));
    setText('#home-hero-leftover', signedMoney(scenario.leftover));
    setText('#home-hero-ratio', ratio(scenario.ratio));
    setText('#home-hero-housing', percent(scenario.housingShare));
    setText('#home-hero-chip', scenario.state.code + ' · ' + signedMoney(scenario.leftover));
    setText('#home-hero-finding', scenario.leftover >= 0
      ? 'In ' + scenario.state.name + ', this ' + scenario.career.name.toLowerCase() + ' scenario covers the modeled plan and leaves ' + money(scenario.leftover) + ' per month before any unmodeled surprises.'
      : 'In ' + scenario.state.name + ', this ' + scenario.career.name.toLowerCase() + ' scenario falls short of the modeled plan by ' + money(Math.abs(scenario.leftover)) + ' per month.');
    var flow = $('#home-hero-flow');
    if (flow) flow.style.width = clamp(scenario.monthlyBudget / scenario.takeHome * 100, 0, 100) + '%';
    var salaryCard = $('.salary-card');
    if (salaryCard) {
      salaryCard.classList.remove('scenario-update');
      void salaryCard.offsetWidth;
      salaryCard.classList.add('scenario-update');
    }
  }

  function renderHomePassport() {
    var careerId = $('#home-career-select').value;
    var stateA = $('#home-state-a').value;
    var stateB = $('#home-state-b').value;
    var housingId = $('#home-housing-select').value;
    var scenarioA = calculate({ careerId: careerId, stateCode: stateA, year: latestYear(), householdId: 'solo', percentileKey: 'median', modeId: 'balanced', housingId: housingId });
    var scenarioB = calculate({ careerId: careerId, stateCode: stateB, year: latestYear(), householdId: 'solo', percentileKey: 'median', modeId: 'balanced', housingId: housingId });
    renderCareerDeck(careerId);
    renderHomeHero(scenarioA);
    renderHomeHousing(scenarioA, scenarioB);
    renderHomeScenario(scenarioA);
    renderReportEvidence(scenarioA, scenarioB);
    renderHomeHouse(scenarioA);
    renderHomeTimeMachine(scenarioA);
    setText('#home-passport-a', '');
    setText('#home-passport-b', '');
    $('#home-passport-a').innerHTML = '<small>' + scenarioA.state.name + '</small><strong>' + signedMoney(scenarioA.leftover) + ' / mo</strong>';
    $('#home-passport-b').innerHTML = '<small>' + scenarioB.state.name + '</small><strong>' + signedMoney(scenarioB.leftover) + ' / mo</strong>';
    var delta = scenarioA.leftover - scenarioB.leftover;
    $('#home-passport-result').innerHTML = '<span>' + scenarioA.career.name + ' · median salary · solo renter</span><strong>' + money(Math.abs(delta)) + ' monthly difference</strong><span class=\"passport-delta\">' + (delta >= 0 ? scenarioA.state.code + ' has more room' : scenarioB.state.code + ' has more room') + '</span>';
    setText('#home-passport-explanation', 'With the same ' + scenarioA.career.name.toLowerCase() + ' paycheck and ' + scenarioA.housingProfile.label.toLowerCase() + ', ' + (delta >= 0 ? scenarioA.state.name : scenarioB.state.name) + ' leaves ' + money(Math.abs(delta)) + ' more per month after the modeled plan. This isolates the effect of location.');
    setText('#home-equation-live-note', 'For this ' + scenarioA.career.name.toLowerCase() + ' in ' + scenarioA.state.name + ', take-home pay is ' + money(scenarioA.takeHome) + ' per month, the modeled plan is ' + money(scenarioA.monthlyBudget) + ', and the remaining amount is ' + signedMoney(scenarioA.leftover) + '.');
  }

  function initHomePassport() {
    selectOptions($('#home-career-select'), DATA.careers, 'id', function (item) { return item.name; });
    selectOptions($('#home-state-a'), DATA.states, 'code', function (item) { return item.name; });
    selectOptions($('#home-state-b'), DATA.states, 'code', function (item) { return item.name; });
    selectOptions($('#home-housing-select'), DATA.housing, 'id', function (item) { return item.label; });
    $('#home-career-select').value = 'nurse';
    $('#home-state-a').value = 'TX';
    $('#home-state-b').value = 'CA';
    $('#home-housing-select').value = 'one-bedroom';
    $all('#home-career-select, #home-state-a, #home-state-b, #home-housing-select').forEach(function (element) {
      element.addEventListener('change', renderHomePassport);
    });
    var divider = $('#home-state-divider');
    if (divider) {
      var syncSwipe = function () { updateHomeStateSwipe(divider.value); };
      divider.addEventListener('input', syncSwipe);
      divider.addEventListener('change', syncSwipe);
    }
    var timeScrubber = $('#home-time-scrubber');
    if (timeScrubber) {
      timeScrubber.min = String(DATA.years[0]);
      timeScrubber.max = String(latestYear());
      timeScrubber.value = String(latestYear());
      timeScrubber.addEventListener('input', function () {
        var result = calculate({ careerId: $('#home-career-select').value, stateCode: $('#home-state-a').value, year: latestYear(), householdId: 'solo', percentileKey: 'median', modeId: 'balanced', housingId: $('#home-housing-select').value });
        renderHomeTimeMachine(result);
      });
    }
    renderHomePassport();
  }

  function initArrivalGate() {
    var gate = $('#arrival-gate');
    if (!gate) return;
    var door = $('#arrival-door');
    var skip = $('#arrival-skip');
    var status = $('#arrival-status');
    var entered = false;
    document.body.classList.add('arrival-locked');
    function enterSite() {
      if (entered) return;
      entered = true;
      if (status) status.textContent = 'KNOCK. KNOCK. WELCOME INSIDE.';
      gate.classList.add('is-knocking');
      window.setTimeout(function () {
        gate.classList.remove('is-knocking');
        gate.classList.add('is-opening');
        if (status) status.textContent = 'THE HOUSE IS OPEN. FOLLOW THE LIGHT.';
      }, 440);
      window.setTimeout(function () {
        if (status) status.textContent = 'ENTERING THE LIVING BLUEPRINT...';
        gate.classList.add('is-entering');
        document.body.classList.remove('arrival-locked');
      }, 1260);
      window.setTimeout(function () {
        gate.classList.add('is-gone');
      }, 3150);
    }
    if (door) {
      door.addEventListener('click', enterSite);
      door.addEventListener('dblclick', enterSite);
    }
    if (skip) skip.addEventListener('click', enterSite);
  }

  if (page === 'dashboard') initDashboard();
  if (page === 'home') {
    initArrivalGate();
    renderHome();
    initHomePassport();
  }
})();
