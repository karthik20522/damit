var assetParentProperties = [];
var assetFilteredFields = [];

var DsaUtilities = {
    toCsv: function(objArray) {
        var headerNames = [],
            csvList = [];

        if ($.inArray("masterId", headerNames) == -1) headerNames.push("masterId");

        objArray.forEach(function(data) {
            for (var elem in data) {
                if ($.inArray(elem, headerNames) == -1) headerNames.push(elem);
            }
        });

        csvList.push(headerNames.join(","));

        objArray.forEach(function(data) {
            var csvRow = [];
            headerNames.forEach(function(header) {
                if (!data[header] || data[header] === "undefined" || data[header] === null) csvRow.push("");
                else {
                    var tempString = DsaUtilities.replaceAll(data[header].toString(), "\r\n", "");
                    csvRow.push(DsaUtilities.replaceAll(tempString, ",", ""));
                }
            });
            csvList.push(csvRow.join(","));
        });

        return csvList.join("\n");
    },

    flatten: function(data) {
        var result = {};

        function recurse(cur, prop) {
            if (Object(cur) !== cur) {
                result[prop] = cur;
            } else if (Array.isArray(cur)) {
                for (var i = 0, l = cur.length; i < l; i++)
                    recurse(cur[i], prop + "[" + i + "]");
                if (l == 0)
                    result[prop] = [];
            } else {
                var isEmpty = true;
                for (var p in cur) {
                    isEmpty = false;
                    recurse(cur[p], prop ? prop + "." + p : p);
                }
                if (isEmpty)
                    result[prop] = {};
            }
        }
        recurse(data, "");
        return result;
    },

    replaceAll: function(text, search, replacement) {
        return text.replace(new RegExp(search, 'g'), replacement);
    },

    //REMOVE ALL ES FIELD CRAP. CLEAN THE ASSET FIELD NAMES
    filterAssetFields: function(data) {
        var filteredFields = [];
        var rootFieldNames = [];
        var optGroup = {};

        Object.keys(data).forEach(function(key) {

            if (key.toLowerCase().indexOf("properties") > 0 &&
                key.toLowerCase().indexOf("keywords") < 0 &&
                key.toLowerCase().indexOf("dynamic") < 0) {

                var newKey = DsaUtilities.replaceAll(key, ".properties", "").
                replace("asset_index.mappings.", "").
                replace(".type", "").
                replace("asset.", "");

                rootFieldNames.push(newKey.split('.')[0]);
                filteredFields.push(newKey);
            }
        });

        rootFieldNames = rootFieldNames.filter(function(v, i) { //get Parent field names
            return rootFieldNames.indexOf(v) == i;
        });

        assetParentProperties = rootFieldNames;
        assetFilteredFields = filteredFields;

        return { "root": rootFieldNames, "fields": filteredFields };
    },

    generateQueryString: function(field) {
        return $(field).attr("field") + ":" + $(field).attr("value");
    },

    jsUcfirst: function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
};

var DsaSearch = {

    getListOfFields: function() {
        $.getJSON("http://search.gettyimages.io/assets/asset/_mapping", function(data) {
            var flattenedObj = DsaUtilities.flatten(data);
            var filteredFieldNames = DsaUtilities.filterAssetFields(flattenedObj);
            DsaSearch.appendESSearchFieldsToBody(filteredFieldNames.root, filteredFieldNames.fields);
        });
    },

    appendESSearchFieldsToBody: function(fields, data) {
        var selectDropDownElem = $('<select id="assetPropertySelector" data-header="Step 1: Pick a field to search on.." title="Step 1: Pick a field to search on.." data-live-search="true" class="selectpicker" style="width: 100%" />');
        for (var key in fields) {
            var group = $('<optgroup label="' + fields[key] + '" />');
            var fieldNames = data.filter(function(v, i) {
                return v.indexOf(fields[key]) == 0;
            });

            for (var val in fieldNames) {
                $('<option />', { value: fieldNames[val], text: fieldNames[val].replace(fields[key] + ".", '') }).appendTo(group);
            }
            group.appendTo(selectDropDownElem);
        }

        $("#propertySelectDiv").prepend(selectDropDownElem);
        $('#assetPropertySelector').selectpicker();

        $('#assetPropertySelector').on('hidden.bs.select', function(e) {
            $("#selectpickerValue").attr('disabled', true);
            $("#selectpickerValue").selectpicker('refresh');
            DsaSearch.getTermsAggregation($(this).val());
        });
    },

    getTermsAggregation: function(field) {
        var termQuery = { size: 0, aggs: { data: { terms: { field: field, size: 2500 } } } };

        $.ajax({
            type: 'POST',
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            url: "http://search.gettyimages.io/assets/asset/_search",
            data: JSON.stringify(termQuery)
        }).done(DsaSearch.parseESBuckets).fail(function(e) {
            alert(JSON.stringify(e));
        });
    },

    parseESBuckets: function(result) {
        var selectElem = $("#selectpickerValue");
        $(selectElem).empty(); //clear all existing values first

        var buckets = result.aggregations.data.buckets;
        for (var val in buckets) {
            var text = buckets[val].key;
            if (text.length > 30) text = text.substring(0, 30) + "...";
            var optionElem = '<option value="' + buckets[val].key + '" data-subtext="[' + buckets[val].doc_count + ']">' + text + '</option>';
            $(selectElem).append(optionElem);
        }

        $(selectElem).removeAttr("disabled");
        $(selectElem).selectpicker('refresh');
    },

    quickSearch: function() {
        var listOfQuries = [];

        var familyValue = $('.qk_family:checkbox:checked').map(function() {
            return DsaUtilities.generateQueryString(this)
        }).get().join(" OR ");

        var contentValue = $('.qk_content:checkbox:checked').map(function() {
            return DsaUtilities.generateQueryString(this)
        }).get().join(" OR ");

        var homeValue = $('.qk_home:checkbox:checked').map(function() {
            return DsaUtilities.generateQueryString(this)
        }).get().join(" OR ");

        var statusValue = $('.qk_status:checkbox:checked').map(function() {
            return DsaUtilities.generateQueryString(this)
        }).get().join(" OR ");

        var fromDate = $("#qk_from_date").val() != "" ? new Date($("#qk_from_date").val()).toISOString().slice(0, 10) : "";
        var toDate = $("#qk_to_date").val() != "" ? new Date($("#qk_to_date").val()).toISOString().slice(0, 10) : "";

        if (familyValue.trim() != "") listOfQuries.push("(" + familyValue + ")");
        if (contentValue.trim() != "") listOfQuries.push("(" + contentValue + ")");
        if (homeValue.trim() != "") listOfQuries.push("(" + homeValue + ")");
        if (statusValue.trim() != "") listOfQuries.push("(" + statusValue + ")");
        if (fromDate != "") listOfQuries.push("submitDate:[" + fromDate + " TO " + (toDate == "" ? "*" : toDate) + "]");

        if (listOfQuries.length > 0) DsaSearch.queryElasticsearch(listOfQuries.join(" AND "));
    },

    advancedSearch: function() {
        var listOfQuries = [];

        $(".advanced_search_fields").each(function() {
            var fieldName = $(this).attr("field");
            var values = $(this).attr("value").split(",").map(function(e) {
                return fieldName + ":" + (e.indexOf(" ") > 0 ? "\"" + e + "\"" : e);
            }).join(" OR ");

            if (values.trim() != "") listOfQuries.push("(" + values + ")");
        });

        if (listOfQuries.length > 0) DsaSearch.queryElasticsearch(listOfQuries.join(" AND "));
    },

    setCatAnimation: function() {
        $("#tableResultsDiv").empty().html('<div class="col" style="text-align:center; margin-top: 250px;"><img src="http://www.picgifs.com/divider/lines/animals/lines-animals-531143.gif" /></div>');
        $("#resultNavigationGroup").empty();
    },

    queryElasticsearch: function(queryString, from) {
        $("#yourQuery").text(queryString);
        $("#yourQueryDiv").show();

        if (!from) from = 0;

        DsaSearch.setCatAnimation();

        var queryJSON = {
            size: 30,
            _source: ["licenseCharacteristics.assetFamily",
                "contents.contentType",
                "submitDate",
                "masterId",
                "contents.contentManagement.state",
                "assetManagement.readyForPublish",
                "assetManagement.readyForSale"
            ],
            query: { query_string: { query: queryString } },
            from: from * 30
        };

        $.ajax({
            type: 'POST',
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            url: "http://search.gettyimages.io/assets/asset/_search",
            data: JSON.stringify(queryJSON)
        }).done(function(data) {
            DsaSearch.displayTableResults(data, from);
        }).fail(function(e) {
            alert(JSON.stringify(e));
        });
    },

    displayTableResults: function(data, pageNumber) {
        var table = '<div class="col-lg-6"><div class="hpanel"><div class="panel-body"><div class="table-responsive"><table cellpadding="1" cellspacing="1" class="table table-condensed table-striped"><thead><tr><th>MasterId</th><th>RFP/RFS</th><th>Family</th><th>Type</th><th>SubmitDate</th></tr></thead><tbody>{0}</tbody></table></div></div></div></div>';

        if (data.hits.total > 0) {
            $("#tableResultsDiv").empty();

            var groupSize = Math.floor(data.hits.hits.length / 2);
            var groups = [data.hits.hits.splice(0, groupSize), data.hits.hits];

            for (var index in groups) {
                var tableRows = [];

                for (var i = 0; i < groups[index].length; i++) {
                    var masterId = groups[index][i]._source.masterId;
                    var rfp = groups[index][i]._source.assetManagement && groups[index][i]._source.assetManagement.readyForPublish ? "Yes" : "No";
                    var rfs = groups[index][i]._source.assetManagement && groups[index][i]._source.assetManagement.readyForSale ? "Yes" : "No";
                    var assetFamily = groups[index][i]._source.licenseCharacteristics && groups[index][i]._source.licenseCharacteristics.assetFamily ? groups[index][i]._source.licenseCharacteristics.assetFamily : " - ";
                    var contentType = groups[index][i]._source.contents ? groups[index][i]._source.contents[0].contentType : " - ";

                    tableRows.push("<tr><td><a href='#' class='masterIdLink'>" + masterId + "</a></td><td>" + rfp + "/" + rfs + "</td><td>" + assetFamily + "</td><td>" + contentType + "</td><td>" + new Date(groups[index][i]._source.submitDate).toUTCString() + "</td></tr>");
                }
                $("#tableResultsDiv").append(table.replace("{0}", tableRows.join("")));
            }
            $(".masterIdLink").on("click", DsaSearch.viewDetails);
            $("#resultNavigateDiv").show();
            DsaSearch.generatePaging(data.hits.total, pageNumber);
        } else {
            $("#tableResultsDiv").empty().html('<div class="col-lg-12 text-center welcome-message"><h2>No Results</h2></div>');
            $("#resultNavigateDiv").hide();
        }
    },

    viewDetails: function(e) {
        e.preventDefault();
        var masterIdToLookup = $(this).text();

        $.ajax({
            type: 'GET',
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            url: "http://search.gettyimages.io/assets/asset/" + masterIdToLookup,
        }).done(function(data) {

            $("#right-sidebar").show();

            var imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/600px-No_image_available.svg.png';

            var assetFamily = data._source.licenseCharacteristics && data._source.licenseCharacteristics.assetFamily ? data._source.licenseCharacteristics.assetFamily : " - ";
            var contentType = data._source.contents ? data._source.contents[0].contentType : " - ";
            var contentHome = data._source.contents ? data._source.contents[0].homeProperty : " - ";
            var contentState = data._source.contents && data._source.contents[0].contentManagement ? data._source.contents[0].contentManagement.state : " - ";

            if (contentType === "Image" && data._source.assetMetadata && data._source.assetMetadata[0].data.canonicalUrl) {
                imageUrl = 'http://media.gettyimages.com' + data._source.assetMetadata[0].data.canonicalUrl;
            }

            $("#assetViewFamily").text(assetFamily);
            $("#assetViewType").text(contentType);
            $("#assetViewHome").text(contentHome);
            $("#assetViewState").text(contentState);
            $("#assetViewMasterId").text(data._source.masterId);
            $("#assetViewImage").attr("src", imageUrl);

            $("#assetJsonData").empty();
            $("#assetJsonData").JSONView(data._source, { collapsed: true });
        }).fail(function(e) {
            alert(JSON.stringify(e));
        });
    },

    generatePaging: function(count, pageNumber) {

        if (!pageNumber) pageNumber = 0;

        var totalPages = count / 30;
        for (var i = 0; i < totalPages; i++) {
            if (i >= 10) {
                var tooMuchDataBtn = ' <button class="btn btn-default" id="toomuchdata" data-toggle="tooltip" data-placement="top" title="Too many results [' + count + ']. Please filter your search.">...</button>';
                $("#resultNavigationGroup").append(tooMuchDataBtn);
                $('#toomuchdata').tooltip();
                break;
            } else {
                var pageBtn = '<button class="btn btn-default pageNumber ' + (i == pageNumber ? "active" : "") + '">' + (i + 1) + '</button>';
                $("#resultNavigationGroup").append(pageBtn);
            }
        }

        var exportBtn = '<button assetCount="' + count + '" class="btn btn-default exportToCSV" data-toggle="modal" data-target="#myModal" type="button">Export to CSV</button>';
        $("#resultNavigationGroup").append(exportBtn);
        $("#resultNavigateDiv").show();

        $(".pageNumber").on('click', function() {
            $(".pageNumber").each(function() {
                $(this).removeClass("active");
            });
            $(this).addClass("active");
            DsaSearch.queryElasticsearch($("#yourQuery").text(), parseInt($(this).text()) - 1);
        });

        $(".exportToCSV").on('click', function() {
            DsaSearch.setPropertiesSelectionForExport();
        });
    },

    addAdvancedSearchFieldsToBody: function() {
        var fieldName = $('#assetPropertySelector').val();
        var value = $("#selectpickerValue").val().join(", ");

        var template = '<div field="' + fieldName + '" value="' + value + '" class="hpanel advanced_search_fields">' +
            '<div class="panel-heading noPaddingTB">' +
            '<div class="panel-tools">' +
            '<a class="closebox"><i class="fa fa-times"></i></a>' +
            '</div>' +
            DsaUtilities.jsUcfirst(fieldName.split(".").pop()) + ': ' + value +
            '</div>' +
            '</div>';

        $("#selectedValues").append(template);
        $(".closebox").on("click", function(e) {
            e.preventDefault();
            $(this).parent().parent().parent().remove();
        });
    },

    searchByMasterIds: function(event) {
        if (event.which == 13) {
            event.preventDefault();
            var ids = $("#searchByIds").val().trim().split(",");
            var query = "masterId:(" + ids.join(" ") + ")";
            DsaSearch.queryElasticsearch(query, 0);
        }
    },

    setPropertiesSelectionForExport: function() {
        var parentFieldNames = [];

        if ($("#exportAssetPropertiesSelector").length == 0) {
            var selectDropDownElem = $('<select id="exportAssetPropertiesSelector" data-width="100%" data-header="Pick individual fields to export" title="Pick individual fields to export" multiple data-live-search="true" class="selectpicker" style="width: 100%" />');
            for (var key in assetParentProperties) {
                var group = $('<optgroup label="' + assetParentProperties[key] + '" />');
                var assetFields = assetFilteredFields.filter(function(v, i) {
                    return v.indexOf(assetParentProperties[key]) == 0;
                });

                for (var val in assetFields) {
                    parentFieldNames.push(assetFields[val].split('.').slice(0, -1).join('.'));
                    $('<option />', { value: assetFields[val], text: assetFields[val].replace(assetParentProperties[key] + ".", '') }).appendTo(group);
                }
                group.appendTo(selectDropDownElem);
            }

            parentFieldNames = parentFieldNames.filter(function(v, i) {
                return parentFieldNames.indexOf(v) == i;
            }).sort();
            $("#exportAssetPropertiesDiv").prepend(selectDropDownElem);
            $('#exportAssetPropertiesSelector').selectpicker();
        }
        if ($("#exportRootAssetPropertiesSelector").length == 0) {
            var selectDropDownElem = $('<select id="exportRootAssetPropertiesSelector" data-width="100%" data-header="Pick Parent fields to export" title="Pick Parent fields to export" multiple data-live-search="true" class="selectpicker" style="width: 100%" />');

            for (var key in parentFieldNames) {
                $('<option />', { value: parentFieldNames[key], text: parentFieldNames[key] }).appendTo(selectDropDownElem);
            }

            $("#exportRootPropertiesDiv").prepend(selectDropDownElem);
            $('#exportRootAssetPropertiesSelector').selectpicker();
        }
    },

    exportToCSV: function() {
        var query = $("#yourQuery").text();
        var rootFieldsSelected = [],
            assetFieldsSelected = [];

        if ($("#exportRootAssetPropertiesSelector").val()) {
            rootFieldsSelected = $("#exportRootAssetPropertiesSelector").val().map(function(val) {
                return val + ".*"
            });
        }
        if ($("#exportAssetPropertiesSelector").val()) {
            assetFieldsSelected = $("#exportAssetPropertiesSelector").val();
        }

        assetFieldsSelected.push("masterId");

        DsaSearch.scanAndScroll(query, rootFieldsSelected.concat(assetFieldsSelected));
    },

    scanAndScroll: function(queryString, sourceFieldArray) {
        var client = new $.es.Client({
            hosts: 'http://search.gettyimages.io'
        });

        var allRecords = [];

        $("#exportProgressBarDiv").show();

        client.search({
            index: 'assets',
            type: 'asset',
            scroll: '30s',
            body: {
                _source: sourceFieldArray,
                size: 100,
                query: { query_string: { query: queryString } }
            }
        }, function getMoreUntilDone(error, response) {
            response.hits.hits.forEach(function(hit) {
                allRecords.push(DsaUtilities.flatten(hit._source));
            });

            var percentageCompletion = Math.floor((allRecords.length / response.hits.total) * 100);
            $("#exportProgressBar").css({ width: percentageCompletion + "%" }).attr("aria-valuenow", percentageCompletion).text(percentageCompletion + "%");

            if (response.hits.total !== allRecords.length) {
                client.scroll({
                    scrollId: response._scroll_id,
                    scroll: '30s'
                }, getMoreUntilDone);
            } else {
                var csvData = DsaUtilities.toCsv(allRecords);

                var filename = "asset_export.csv";
                var blob = new Blob([csvData], {
                    type: "text/plain;charset=utf-8"
                });
                saveAs(blob, filename);
            }
        });
    }
};

//Initialize
DsaSearch.getListOfFields();

$("#qk_search_btn").click(DsaSearch.quickSearch);
$("#adv_search_btn").click(DsaSearch.advancedSearch);
$("#addAdvFieldBtn").click(DsaSearch.addAdvancedSearchFieldsToBody);
$("#searchByIds").keypress(DsaSearch.searchByMasterIds);
$("#exportDataBtn").click(DsaSearch.exportToCSV)
$("#sidebar-close").click(function(e) { 
    e.preventDefault();
    $("#right-sidebar").hide(); 
});
$("#jsonView").click(function(){ $("#assetJsonData").JSONView("toggle"); })
$('#jsonEdit').tooltip();
$('.input-daterange').datepicker({
    format: 'mm/dd/yyyy'
});
