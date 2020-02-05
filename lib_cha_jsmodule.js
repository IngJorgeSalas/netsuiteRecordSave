/**
 * @Author Jorge Salas
 * @File ContratoSistemaLogistico.xlsx page 1
 * @Name lib_cha_jsmodule.js
 * @Description modulo con funciones varias como validar tipo, calidar obligatoriedad y un 'submitfields' con capacidad de llegar hasta subrecords.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', 'N/search', './lib_cha_historial', 'N/http', 'N/ui/serverWidget', './lib_cha_occToken', 'N/format'], function (record, search, logs, http, serverWidget, token, formatAPI) {

    function journalFulfillmentPick(itemsArr, type){
        //@File DERD_-_Pólizas_Contables_desde_la_Operación_de_Venta_V.1.3
        function elementCount(arr) {
            let a = [], b = [], prev;

            arr.sort();
            for ( let i = 0; i < arr.length; i++ ) {
                if ( arr[i] !== prev ) {
                    a.push(arr[i]);
                    b.push(1);
                } else {
                    b[b.length-1]++;
                }
                prev = arr[i];
            }

            return [a, b];
        }

        let itemObj={};
        let itemArr=[];
        let values={};
        let obj2createUpdateTransform={};
        let sum=0;
        let account1="";
        let account2="";
        let sellAccount="214";
        let inventoryAccount="216";
        let [itemIdArr, countArr]=elementCount(itemsArr);
        log.debug("itemIdArr",itemIdArr);
        log.debug("countArr",countArr);
        let customSearchObj = search.create({
            type: "item",
            filters:
                [
                    ["internalid","anyof",itemIdArr]
                ],
            columns:
                [
                    "internalid",
                    "averagecost"
                ]
        });
        customSearchObj.run().each(function(result){
            let avg=result.getValue("averagecost");
            if (avg==""){
                avg=0;
            }
            let qty=countArr[itemIdArr.indexOf(parseInt(result.getValue("internalid")))];
            log.debug("avg",[avg,qty,result.getValue("internalid"),itemIdArr.indexOf(parseInt(result.getValue("internalid")))].join(", "));
            sum+=parseFloat(avg)*parseInt(qty);
            return true;
        });
        let avgSum=(sum/countArr.reduce((a, b) => a + b, 0)).toFixed(2);
        let fieldLookUp = search.lookupFields({
            type: "customrecord_bex_journal_entry_subsidiar",
            id: '1',
            columns: ['custrecord_bex_journla_subsidiary']
        });
        let subsidiary=fieldLookUp.custrecord_bex_journla_subsidiary[0].value;
        if (type.toLowerCase()=="pick"){
            account1=sellAccount;
            account2=inventoryAccount;
        }else{
            account2=sellAccount;
            account1=inventoryAccount;
        }
        log.debug("sums",[sum,avgSum,countArr.reduce((a, b) => a + b, 0)].join(", "))
        itemObj["account"] = account1;
        itemObj["debit"] = avgSum;
        itemArr.push(itemObj);
        itemObj={};
        itemObj["account"] = account2;
        itemObj["credit"] = avgSum;
        itemArr.push(itemObj);
        values['subsidiary'] = subsidiary;
        values['line'] = itemArr;
        obj2createUpdateTransform['values'] = values;
        obj2createUpdateTransform['recordType'] = "journalentry";
        obj2createUpdateTransform['isDynamic'] = true;
        log.debug('js.journalentry', obj2createUpdateTransform);
        let response = submitFieldsJS(obj2createUpdateTransform);
        return response;
    }
    function oldestLot(itemId, loteSerial, storeId, qty){
        let exit=[];
        let quantity=0;
        let left=qty;
        let status=true;
        let available=0;
        let inventorynumberSearchObj = search.create({
            type: search.Type.INVENTORY_BALANCE,
            filters:
                [
                    ["item", "anyof", itemId],
                    "AND",
                    ["inventorynumber.inventorynumber", "is", loteSerial],
                    "AND",
                    ["location", "anyof", storeId]
                ],
            columns:
                [
                    "inventorynumber",
                    "binnumber",
                    "available",
                    search.createColumn({
                        name: "custitemnumber_be_pedimento_fecha",
                        join: "inventorynumber",
                        sort: search.Sort.ASC
                    })
                ]
        });
        //try {
        inventorynumberSearchObj.run().each(function (result) {
            available=parseInt(result.getValue("available"));
            left-=available;
            if (left<1){
                quantity=left+available;
                status=false;
            }else{
                quantity=available;
            }
            for (let i=0; i<quantity; i++){
                exit.push({
                    "inventorynumber":result.getValue("inventorynumber"),
                    "binNumber":result.getValue("binnumber"),
                    "binName":result.getText("binnumber")
                });
            }
            return status;
        });
        //}catch(e){}
        return exit;
    }
    function binSearch(itemId, storeId, qty){
        let exit=[];
        let quantity=0;
        let left=qty;
        let status=true;
        let available=0;
        let inventorynumberSearchObj = search.create({
            type: search.Type.INVENTORY_BALANCE,
            filters:
                [
                    ["item", "anyof", itemId],
                    "AND",
                    ["binnumber", "noneof", "@NONE@"],
                    "AND",
                    ["location", "anyof", storeId],
                    "AND",
                    ["available", "greaterthan", "0"]
                ],
            columns:
                [
                    "binnumber",
                    search.createColumn({
                        name: "available",
                        sort: search.Sort.DESC
                    })
                ]
        });
        //try {
        inventorynumberSearchObj.run().each(function (result) {
            available=parseInt(result.getValue("available"));
            left-=available;
            if (left<1){
                quantity=left+available;
                status=false;
            }else{
                quantity=available;
            }
            for (let i=0; i<quantity; i++){
                exit.push({
                    "binNumber":result.getValue("binnumber"),
                    "binName":result.getText("binnumber")
                });
            }
            return status;
        });
        //}catch(e){}
        return exit;
    }
    function daysBetweenDates(dateFrom, dateTo, inclusive=true){
        let date1;
        let date2;
        if (typeof dateFrom == "string"){
            date1 = new Date(dateFrom);
        }else{
            date1=dateFrom;
        }
        if (typeof dateTo == "string"){
            date2 = new Date(dateTo);
        }else{
            date2=dateTo;
        }
        let Difference_In_Time = date2.getTime() - date1.getTime();
        log.debug("differenceTime",Difference_In_Time);
        let Difference_In_Days = Math.abs(Difference_In_Time / 86400000);
        if (inclusive){
            Difference_In_Days++;
        }
        return Math.ceil(Difference_In_Days);
    }
    function clientGlobal2Internal(clientId){
        let clientObj={};
        let customerSearchObj = search.create({
            type: "customer",
            filters:
                [
                    ["externalid","anyof",clientId]
                ],
            columns:
                [
                    "internalid", "firstname", "custentity_bex_ape_pat", "custentity_bex_ape_mat"
                ]
        });
        let myResultSet = customerSearchObj.run();
        let resultRange = myResultSet.getRange({
            start: 0,
            end: 50
        });
        clientObj.clientId = resultRange[0].getValue("internalid");
        clientObj.firstName = resultRange[0].getValue("firstname");
        clientObj.lastNameFather = resultRange[0].getValue("custentity_bex_ape_pat");
        clientObj.lastNameMother = resultRange[0].getValue("custentity_bex_ape_mat");
        return clientObj;
    }

    /**
     *
     * @param item {object} son obligatorias propeidades itemid y rate, ademas se utilizan serial y lote
     * @param request {object} de peticion original, se utiliza las propiedades obligatorias clientid (esternalid), tranDate y numOperation, opcional address
     * @param salesOrderId internalid de la orden de venta
     * @param fulfillId internalid del itemfulfillment
     * @param firstName {string} Nombre del cliente
     * @param lastNameFather {string} apellido paterno cliente
     * @param lastNameMother {string} apellido materno cliente
     * @param locationName {string} nombre de la ubicacion
     * @param locationId externalid de la ubicacion
     * @param sublocationName {string} nombre de la sububicacion
     * @param sublocationId externalid de la sububicacion
     * @param binName {string} nombre del bin
     * @param binNumber internalid del bin
     * @param isOCC {boolean}, true: es de occ, false: no es de OCC
     * @returns {object}
     */
    function logisticRequest(item, request, salesOrderId, fulfillId, firstName, lastNameFather, lastNameMother, locationName, locationId, sublocationName, sublocationId, binName, binNumber=1, subsidiaryName, subsidiaryId, isOCC=false){
        let urlPost="http://200.188.0.214:8080/logistica-api/external/guias/solicitar";
        let longitude="";
        let latitude="";
        let main=false;
        let msg2;
        let errorCode2;
        log.debug("logisticreq","1");
        if (request.clientId && request.address && request.address.address) {
            log.debug("logisticreq",request);
            let customerSearchObj = search.create({
                type: "customer",
                filters:
                    [
                        ["externalid", "anyof", request.clientId],
                        "AND",
                        ["address.isdefaultshipping","is","T"]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "custrecord_bex_addr_latt",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_addr_long",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "isdefaultshipping",
                            join: "Address"
                        })
                    ]
            });
            log.debug("logisticreq",customerSearchObj);
            let searchResultCount = customerSearchObj.runPaged().count;
            if (searchResultCount > 0) {
                log.debug("customerSearchObj result count", searchResultCount);
                customerSearchObj.run().each(function (result) {
                    latitude = result.getValue({
                        name: "custrecord_bex_addr_latt",
                        join: "Address"
                    });
                    longitude = result.getValue({
                        name: "custrecord_bex_addr_long",
                        join: "Address"
                    });
                    main = result.getValue({
                        name: "isdefaultshipping",
                        join: "Address"
                    });
                    return true;
                });
                request.address["latitude"] = latitude;
                request.address["longitude"] = longitude;
                request.address["main"] = main;
            }
        }else if (request.clientId){
            let customerSearchObj = search.create({
                type: "customer",
                filters:
                    [
                        ["externalid","anyof", request.clientId],
                        "AND",
                        ["address.isdefaultshipping","is","T"]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "addressinternalid",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "address1",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_ext_num",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "address2",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_int_num",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "zipcode",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "address3",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "city",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "state",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_ref_dom_1",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_ref_dom_2",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_addr_latt",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_addr_long",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "isdefaultshipping",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "country",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "attention",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_attention_cellphone",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_attention_email",
                            join: "Address"
                        }),
                        search.createColumn({
                            name: "custrecord_bex_attention_phone",
                            join: "Address"
                        })
                    ]
            });
            log.debug("logisticreq2",customerSearchObj);
            let searchResultCount = customerSearchObj.runPaged().count;
            if (searchResultCount > 0) {
                log.debug("customerSearchObj result count", searchResultCount);
                customerSearchObj.run().each(function (result) {
                    if (!request.address){
                        request.address={};
                    }
                    request["address"]["id"]=result.getValue({
                        name: "addressinternalid",
                        join: "Address"
                    });
                    request["address"]["address"]=result.getValue({
                        name: "address1",
                        join: "Address"
                    });
                    request["address"]["extNum"]=result.getValue({
                        name: "custrecord_bex_ext_num",
                        join: "Address"
                    });
                    request["address"]["suburb"]=result.getValue({
                        name: "address2",
                        join: "Address"
                    });
                    request["address"]["interiorNum"]=result.getValue({
                        name: "custrecord_bex_int_num",
                        join: "Address"
                    });
                    request["address"]["zip"]=result.getValue({
                        name: "zipcode",
                        join: "Address"
                    });
                    request["address"]["town"]=result.getValue({
                        name: "address3",
                        join: "Address"
                    });
                    request["address"]["city"]=result.getValue({
                        name: "city",
                        join: "Address"
                    });
                    request["address"]["state"]=result.getValue({
                        name: "state",
                        join: "Address"
                    });
                    request["address"]["ref1"]=result.getValue({
                        name: "custrecord_bex_ref_dom_1",
                        join: "Address"
                    });
                    request["address"]["ref2"]=result.getValue({
                        name: "custrecord_bex_ref_dom_2",
                        join: "Address"
                    });
                    request["address"]["latitude"]=result.getValue({
                        name: "custrecord_bex_addr_latt",
                        join: "Address"
                    });
                    request["address"]["longitude"]=result.getValue({
                        name: "custrecord_bex_addr_long",
                        join: "Address"
                    });
                    request["address"]["main"]=result.getValue({
                        name: "isdefaultshipping",
                        join: "Address"
                    });
                    request["address"]["country"]=result.getValue({
                        name: "country",
                        join: "Address"
                    });
                    if (!request.address.attention){
                        request.address.attention={};
                    }
                    request["address"]["attention"]["fullName"]=result.getValue({
                        name: "attention",
                        join: "Address"
                    });
                    request["address"]["attention"]["mobile"]=result.getValue({
                        name: "custrecord_bex_attention_cellphone",
                        join: "Address"
                    });
                    request["address"]["attention"]["email"]=result.getValue({
                        name: "custrecord_bex_attention_email",
                        join: "Address"
                    });
                    request["address"]["attention"]["phone"]=result.getValue({
                        name: "custrecord_bex_attention_phone",
                        join: "Address"
                    });
                    return true;
                });
            }
        }
        log.debug("logisticreq","3");
        let itemSearchObj = search.create({
            type: "item",
            filters:
                [
                    ["internalid", "anyof", item["itemId"].toString()]
                ],
            columns:
                [
                    "itemid",
                    "department",
                    "displayname",
                    "custitem_brand",
                    "custitem_modelid",
                    "custitem_size",
                    "custitem_width",
                    "custitem_height",
                    "custitem_length",
                    "custitem_weight",
                    "custitem_color"
                ]
        });
        let itemid = "";
        let departmentId = "";
        let department = "";
        let description = "";
        let brand = "";
        let model = "";
        let talla = "";
        let itemHeight = "";
        let itemWidth = "";
        let itemLength = "";
        let itemWeight = "";
        let color = "";
        itemSearchObj.run().each(function (result) {
            departmentId = result.getValue("department");
            itemid = result.getValue("itemid");
            department = result.getText("department");
            description = result.getValue("displayname");
            brand = result.getValue("custitem_brand");
            model = result.getValue("custitem_modelid");
            talla = result.getValue("custitem_size");
            itemHeight = result.getValue("custitem_height");
            itemWidth = result.getValue("custitem_width");
            itemLength = result.getValue("custitem_length");
            itemWeight = result.getValue("custitem_weight");
            color = result.getValue("custitem_color");
            return true;
        });
        log.debug("logisticreq","4");
        const dimension = {
            "height": itemHeight,
            "width": itemWidth,
            "length": itemLength,
            "weight": itemWeight
        };
        let itemsCom = {
            "transactionId": fulfillId,
            "departmentId": departmentId,
            "department": department,
            "description": description,
            "numart": itemid,
            "locationName": locationName,
            "locationId": locationId,
            "subLocationId": sublocationId,
            "subLocationName": sublocationName,
            "binName": binName,
            "bin": binNumber,
            "dimension": dimension,
            "serial": item.serial,
            "lote": item.lote,
            "pedimiento": item["pedimiento"],
            "motorNumber": "",//TODO: de donde sale esta info? parece que son caracteristicas del item que todavia no estan implementadas
            "year": "",//TODO: de donde sale esta info?
            "brand": brand,//TODO: de donde sale esta info?
            "model": model,//TODO: de donde sale esta info?
            "talla": talla,//TODO: de donde sale esta info?
            "color": color,
            "quantity": 1,
            "total": item["rate"],
            "lineId": 0
        };
        let customerCom = {
            "customerId": request.clientId,
            "name": firstName,
            "apellidoPaterno": lastNameFather,
            "apellidoMaterno": lastNameMother
        };
        log.debug("logisticreq","5");
        let Authorization=token.getLogisticsSystemToken();
        let headerObj = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization':"Bearer " + Authorization
        };
        let logResponse = logs.addLogRequest(4);
        log.debug("logisticreq","6");
        let body = {
            "transactionId": logResponse.TransactionId,
            "timeStamp": logResponse.TimeStamp,
            "customer": customerCom,
            "subsidiaryId": parseInt(subsidiaryId),
            "subsidiary": subsidiaryName,
            "salesOrderId": salesOrderId,
            "isOCC": isOCC,
            "transactionDate": request.tranDate,
            "operationNumber": request.numOperation,
            "address": request.address,
            "items": [itemsCom]
        };
        log.debug("logisticreqbody",body);
        let response = http.post({
            url: urlPost,
            body: JSON.stringify(body),
            headers: headerObj
        });
        log.debug("logisticreqresponse",response);
        response=JSON.parse(response.body);
        if (response.code == 200) {
            let updateFulfillment = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: fulfillId,
                isDynamic: false
            });
            updateFulfillment.setValue({
                fieldId: 'shipdate',
                value: response.deliveryDate
            });
            updateFulfillment.setValue({
                fieldId: 'custcol_bex_transportadora',
                value: response.deliveryCompany
            });
            updateFulfillment.setValue({
                fieldId: 'custbody_cha_enviado_logistica',
                value: true
            });
            updateFulfillment.setSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_bex_folio_logistico',
                line: response.trackingNumber[0].lineId,
                value: response.trackingNumber[0].trackingNumber
            });
            let updateFulfillmentId=updateFulfillment.save();//*/
            if(updateFulfillmentId<0){
                msg2 = "Error Inesperado";
                errorCode2 = -2005;
            }else{
                msg2 = "";
                errorCode2 = 200;
            }
        } else {
            msg2 = "Error Inesperado";
            errorCode2 = -2005;
        }
        return {
            "msg":msg2,
            "errorCode2":errorCode2
        };

    }
    /**
     * Esta funcion valida que las varibales sean del tipo especificado, se valida con isNAN para numericos y regexp
     * para las fechas en ISO8601, acepta formato 2019-10-09, 2019-10-09T15:05:30 y 2019-10-09T15:05:30Z pero no hace
     * conversion entre horarios.
     * @function validateType
     * @param {string} type - acepta numeric, isoDate y cualquiera de typeof
     * @param {array} arr - arreglo de las variables a validar
     * @returns {boolean} - true si coincide la variable con el tipo especificado
     */
    function validateType(type, arr) {
        type=type.toLowerCase();
        let i = 0;
        let status = true;
        while (status == true && i < arr.length) {
            log.debug("1",arr);
            if (arr[i] || arr[i]==0 || arr[i]===false) {
                if (type == "isoDate" || type == "isodate" || type == "fecha") {
                    let pattern = new RegExp("^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])$|^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9]):([0-5][0-9]):([0-5][0-9])(.[0-9]+)?(Z)?$", "g");
                    if (!pattern.test(arr[i])) {
                        status = false;
                    }
                } else {
                    if (type=="texto"){
                        type="string";
                    }else if (type == "numeric" || type == "numérico" || type == "numerico") {
                        type = "number";
                    }
                    if (typeof arr[i] != type) {
                        status = false;
                    }
                }
            }
            i++;
        }
        return status;
    }

    function objValidateType(objValues, objTypes){
        let status="true";
        for (let elm in objValues){
            if (objValues.hasOwnProperty(elm)){
                log.debug("elm",elm);
                if (typeof objValues[elm] == "object"){
                    status=objValidateType(objValues[elm], objTypes);
                }else if(typeof objValues[elm]!="undefined"){
                    log.debug(objTypes[elm],objValues[elm]);
                    status=validateType(objTypes[elm], [objValues[elm]]);
                    log.debug(elm,status);
                }
            }
        }
        return status;
    }
    /**
     * Esta funcion valida que los contenidos obligatorios existan y no esten vacios, si no encuentra un elemento del
     * arreglo, deja de validar los demas y regresa false
     * @function validateObligatory
     * @param {array} arr - arreglo de las variables a validar
     * @returns {boolean} - true si existen y no estan vacios los elementos del arreglo
     */
    function validateObligatory(arr) {
        let i = 0;
        let status = true;
        while (status == true && i < arr.length) {
            if (!arr[i] && arr[i]!==0 && arr[i]!==false) {
                status = false;
            }
            i++;
        }
        return status;
    }//*/
    /**
     * @Description Esta funcion solo se debe usar en creates/transforms o actualizaciones de sublistas, para actualizar
     * campos a nivel de cabecera se debe usar la funcion original de netsuite.
     * @param request
     * @returns {{msg: string, recordId: void | number, code: number}}
     */
    function submitFieldsJS(request) {
        function validateType(x){
            let status=false;
            let type=typeof x;
            if (type != 'function' && type != 'symbol' && type != "undefined"){
                status=true;
            }
            return status;
        }
        function subobjCrawler(objRecord,request){
            log.debug('subrequest',request);
            let code=200;
            let msg="";
            let sublistName = objRecord.getSublists();
            let objFields = objRecord.getFields();
            for(let property in request) {
                if (Array.isArray(request[property])){
                    log.debug('',"subArray");
                    if (sublistName.includes(property)){
                        log.debug('',"subincludes");
                        let sublistId=property;
                        let sublistFields = objRecord.getSublistFields({
                            sublistId: sublistId
                        });
                        for (let i in request[sublistId]) {
                            if (Object.keys(request[sublistId][i]).length>0){
                                log.debug('subi', i);
                                let lineNum;
                                if (request[sublistId][i]["lineSearch"] && request[sublistId][i]["lineSearch"]["value"]) {
                                    let line = objRecord.findSublistLineWithValue({
                                        sublistId: sublistId,
                                        fieldId: request[sublistId][i]["lineSearch"]["fieldId"],
                                        value: request[sublistId][i]["lineSearch"]["value"]
                                    });
                                    request[sublistId][i]["lineId"] = line;
                                }
                                if (objRecord.isDynamic) {
                                    log.debug("subdyna", "subdyna");
                                    if (request[sublistId][i]["lineId"] || request[sublistId][i]["lineId"] == 0) {
                                        objRecord.selectLine({
                                            sublistId: sublistId,
                                            line: request[sublistId][i].lineId
                                        });
                                        lineNum = request[sublistId][i].lineId;
                                    } else {
                                        lineNum = objRecord.selectNewLine({
                                            sublistId: sublistId
                                        });
                                        log.debug("line1", lineNum);
                                        lineNum = JSON.stringify(lineNum);
                                        lineNum = JSON.parse(lineNum);
                                        lineNum = lineNum["sublists"]["inventoryassignment"]["currentline"]["#"] - 1;//me palicaron la netsuite getCurrentSublistField is not a function
                                    }
                                } else {
                                    lineNum = request[sublistId][i].lineId;
                                }
                                for (let fieldId in request[sublistId][i]) {
                                    if (sublistFields.includes(fieldId)) {
                                        log.debug('sublistId', sublistId);
                                        log.debug('fieldId', fieldId);
                                        log.debug('linenum', lineNum);
                                        let sublistField = objRecord.getSublistField({
                                            sublistId: sublistId,
                                            fieldId: fieldId,
                                            line: lineNum
                                        });
                                        log.debug('sublistField.type', sublistField.type);
                                        if (validateType(request[sublistId][i][fieldId])) {
                                            if (sublistField.type == "date" || sublistField.type == "datetime" || sublistField.type == "datetimetz") {
                                                request[property] = new Date(request[property]);
                                                if (sublistField.type == "date") {
                                                    request[property].setDate(request[property].getDate() + 1);
                                                }
                                            }
                                            log.debug('subfieldsave', fieldId);
                                            log.debug('subvaluesave', request[sublistId][i][fieldId]);
                                            if (objRecord.isDynamic) {
                                                log.debug('dynamicsave', "dynamicsave");
                                                objRecord.setCurrentSublistValue({
                                                    sublistId: sublistId,
                                                    fieldId: fieldId,
                                                    value: request[sublistId][i][fieldId]
                                                });
                                            } else {
                                                log.debug('standartsave', 'standartsave');
                                                objRecord.setSublistValue({
                                                    sublistId: sublistId,
                                                    fieldId: fieldId,
                                                    line: lineNum,
                                                    value: request[sublistId][i][fieldId]
                                                });
                                            }
                                        }
                                    }
                                }
                                if (objRecord.isDynamic) {
                                    objRecord.commitLine({
                                        sublistId: sublistId
                                    });
                                }
                            }
                        }
                    }else{
                        code=-1;
                        msg="error, no se encuentra sublista";
                    }
                }else {
                    if (objFields.includes(property)) {
                        if (validateType(request[property])) {
                            let objField = objRecord.getField({
                                fieldId: property
                            });
                            if (objField.type == "date" || objField.type == "datetime" || objField.type == "datetimetz") {
                                let regex = /-/;
                                if (regex.test(request[property])) {
                                    let date=new Date(request[property]);
                                    let offset=date.getTimezoneOffset()*60000;
                                    request[property] = new Date(date.getTime() + offset);
                                }else if (typeof request[property]=="string"){
                                    request[property]=formatAPI.parse({
                                        value: request[property],
                                        type: objField.type
                                    });
                                }
                                log.debug('parse', request[property]);
                            }
                            log.debug('tipo', [objField.type, property].join(", "));
                            objRecord.setValue({
                                fieldId: property,
                                value: request[property]
                            });
                        }

                    }
                }
            }
        }
        log.debug('request',request);
        let objRecord;
        let code=200;
        let msg="";
        let recordId=-1;
        let ignoreMandatoryFields=false;
        if (request.ignoreMandatoryFields==true){
            ignoreMandatoryFields=true;
        }
        if (request.isDynamic!=true && request.isDynamic!=false){
            request.isDynamic=false;
        }
        log.debug("aa");
        if (request.from){
            log.debug("a1");
            objRecord = record.transform({
                fromType: request.from,
                fromId: request.id,
                toType: request.recordType,
                isDynamic: true
            });
        }else if (!request.id) {
            log.debug("a2");
            objRecord = record.create({
                type: request.recordType,
                isDynamic: request.isDynamic
            });
        }else {
            log.debug("a3");
            objRecord = record.load({
                type: request.recordType,
                id: request.id,
                isDynamic: request.isDynamic
            });
        }
        log.debug("a");
        let sublistName = objRecord.getSublists();
        let objFields = objRecord.getFields();
        request=request.values;
        log.debug("b");
        for(let property in request) {
            if (Array.isArray(request[property])){
                log.debug('',"Array");
                if (sublistName.includes(property)){
                    log.debug('includes',property);
                    let sublistId=property;
                    let sublistFields = objRecord.getSublistFields({
                        sublistId: sublistId
                    });
                    sublistFields.push("inventorydetail");//TODO: no la mejor solucion
                    for (let i in request[sublistId]) {
                        log.debug('i',i);
                        let lineId;
                        if (request[sublistId][i]["lineSearch"] && request[sublistId][i]["lineSearch"]["value"]){
                            let line = objRecord.findSublistLineWithValue({
                                sublistId: sublistId,
                                fieldId: request[sublistId][i]["lineSearch"]["fieldId"],
                                value: request[sublistId][i]["lineSearch"]["value"]
                            });
                            log.debug("requestlinesearch",line);
                            request[sublistId][i]["lineId"]=line;
                        }
                        if (objRecord.isDynamic) {
                            if (request[sublistId][i]["lineId"] || request[sublistId][i]["lineId"] == 0) {
                                objRecord.selectLine({
                                    sublistId: sublistId,
                                    line: request[sublistId][i].lineId
                                });
                            } else {
                                objRecord.selectNewLine({
                                    sublistId: sublistId
                                });
                            }
                        }else{
                            lineId=request[sublistId][i].lineId;
                        }
                        for (let fieldId in request[sublistId][i]) {
                            if (sublistFields.includes(fieldId)) {
                                let sublistField;
                                if (objRecord.isDynamic) {
                                    sublistField = objRecord.getCurrentSublistField({
                                        sublistId: sublistId,
                                        fieldId: fieldId
                                    });
                                }else {
                                    sublistField = objRecord.getSublistField({
                                        sublistId: sublistId,
                                        fieldId: fieldId,
                                        line: lineId
                                    });
                                }
                                if (sublistField.type == "summary") {
                                    log.debug('summary',fieldId);
                                    let objSubrecord;
                                    if (objRecord.isDynamic) {
                                        objSubrecord = objRecord.getCurrentSublistSubrecord({
                                            sublistId: sublistId,
                                            fieldId: fieldId
                                        });
                                    }else{
                                        objSubrecord = objRecord.getSublistSubrecord({
                                            sublistId: sublistId,
                                            fieldId: fieldId,
                                            line: lineId
                                        });
                                    }
                                    subobjCrawler(objSubrecord, request[sublistId][i][fieldId]);
                                } else {
                                    if (validateType(request[sublistId][i][fieldId])) {
                                        if (sublistField.type == "date" || sublistField.type == "datetime" || sublistField.type == "datetimetz") {
                                            request[property] = new Date(request[property]);
                                            if (sublistField.type == "date"){
                                                request[property].setDate(request[property].getDate() + 1);
                                            }
                                        }
                                        log.debug('fieldIdsave', fieldId);
                                        if (objRecord.isDynamic) {
                                            log.debug('dynamic', "dynamic");
                                            objRecord.setCurrentSublistValue({
                                                sublistId: sublistId,
                                                fieldId: fieldId,
                                                value: request[sublistId][i][fieldId]
                                            });
                                        }else{
                                            objRecord.setSublistValue({
                                                sublistId: sublistId,
                                                fieldId: fieldId,
                                                line: lineId,
                                                value: request[sublistId][i][fieldId]
                                            });
                                        }
                                    }
                                }
                            }
                        }
                        if (objRecord.isDynamic) {
                            objRecord.commitLine({
                                sublistId: sublistId
                            });
                        }
                    }
                }else{
                    code=-1;
                    msg="error, no se encuentra sublista";
                }
            }else {
                if (objFields.includes(property)) {
                    let objField = objRecord.getField({
                        fieldId: property
                    });
                    if (objField.type == "summary") {
                        let objSubrecord = objRecord.getSubrecord({
                            fieldId: property
                        });
                        subobjCrawler(objSubrecord, request[property]);
                    } else {
                        log.debug([property],request[property]);
                        if (validateType(request[property])) {
                            if (objField.type == "date" || objField.type == "datetime" || objField.type == "datetimetz") {
                                let regex = /-/;
                                if (regex.test(request[property])) {
                                    let date=new Date(request[property]);
                                    let offset=date.getTimezoneOffset()*60000;
                                    request[property] = new Date(date.getTime() + offset);
                                }else{
                                    request[property]=formatAPI.parse({
                                        value: request[property],
                                        type: objField.type
                                    });
                                }
                                log.debug('parse', request[property]);
                            }else if(objField.type == "currency"){
                                let requestPropertyString=request[property].toString();
                                if (requestPropertyString.length>20){
                                    let requestPropertyString20=requestPropertyString.substring(19, 20);
                                    let requestPropertyString21=requestPropertyString.substring(20, 21);
                                    requestPropertyString=requestPropertyString.substring(0, 19);
                                    if (requestPropertyString21>4){
                                        requestPropertyString20++;
                                    }
                                    request[property]=requestPropertyString+requestPropertyString20;
                                }
                            }
                            log.debug('tipo', [objField.type, property].join(", "));
                            objRecord.setValue({
                                fieldId: property,
                                value: request[property]
                            });
                        }
                    }
                }
            }
        }
        //try {
        log.debug('save',"save");
        recordId = objRecord.save({
            ignoreMandatoryFields: ignoreMandatoryFields
        });
        //}catch(e){}
        if (recordId<1){
            code=-2;
            msg="error al guardar el registro";
        }
        return {
            "code": code,
            "msg": msg,
            "recordId": recordId
        };
    }

    function createListFromObj(form, request){
        let sublist = form.addSublist({
            id : request.id,
            type : serverWidget.SublistType[request.type],
            label : request.label
        });
        log.debug('',"1");
        for (let columnObj of request.columns) {
            sublist.addField({
                id: columnObj.id,
                type: serverWidget.FieldType[columnObj.type],
                label: columnObj.label
            });
        }
        log.debug('',"2");
        for (let i=0; i<request.data.length; i++) {
            let dataObj=request.data[i];
            for (let key in dataObj) {
                sublist.setSublistValue({
                    id: key,
                    line: i,
                    value: dataObj[key]
                });
            }
        }
        log.debug('',"3");
        let fieldgroup=form.addFieldGroup({
            id : 'custpage_filterfieldgroup',
            label : 'Filtros',
            isCollapsible: true,
            isCollapsed: true
        });
        fieldgroup.isCollapsible = true;
        //fieldgroup.isCollapsed= true;
        log.debug('',"4");
        for (let filter of request.filters){
            let field=form.addField({
                id : filter.id,
                type : filter.type,
                label : filter.label,
                container : 'custpage_filterfieldgroup'
            });
            if(filter.defaultValue) {
                field.defaultValue = filter.defaultValue;
            }
        }
        log.debug('',"5");
        return form;
    }
    function createListFromSearch(form, searchId, sublistId, sublistType, sublistLabel){
        let mySearch = search.load({
            id: searchId
        });
        let columns=mySearch.columns;
        let sublist = form.addSublist({
            id : "custpage_"+sublistId,
            type : serverWidget.SublistType[sublistType],
            label : sublistLabel
        });
        log.debug('columns',columns);
        for (let columnObj of columns) {
            columnObj=JSON.stringify(columnObj);
            columnObj=JSON.parse(columnObj);
            sublist.addField({
                id: "custpage_"+columnObj.join.toLowerCase()+columnObj.name,
                type: "TEXT",
                label: columnObj.label
            });
        }
        let i=0;
        mySearch.run().each(function(result) {
            log.debug("",result);
            for (let columnObj of columns) {
                if (result.getValue(columnObj)) {
                    columnObj = JSON.stringify(columnObj);
                    columnObj = JSON.parse(columnObj);
                    log.debug('obj', columnObj["join"]);
                    log.debug('type', columnObj["name"]);
                    sublist.setSublistValue({
                        id: "custpage_" + columnObj.join.toLowerCase() + columnObj.name,
                        line: i,
                        value: result.getValue(columnObj)
                    });
                }
            }
            i++;
            return true;
        });
        return form;
    }
    return{
        objValidateType:objValidateType,
        validateType:validateType,
        validateObligatory:validateObligatory,
        submitFieldsJS:submitFieldsJS,
        logisticRequest:logisticRequest,
        createListFromSearch:createListFromSearch,
        createListFromObj:createListFromObj,
        clientGlobal2Internal:clientGlobal2Internal,
        daysBetweenDates:daysBetweenDates,
        oldestLot:oldestLot,
        binSearch:binSearch,
        journalFulfillmentPick:journalFulfillmentPick
    }
});