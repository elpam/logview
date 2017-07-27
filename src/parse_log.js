var fs = require('fs');
var Alpine = require('./parser/alpine');
var byline = require('byline');
var PromiseSftp = require('promise-sftp');
var promiseSftp = new PromiseSftp();
const Store = require('electron-store');
const store = new Store();
var previousLogSize = 0;

window.chartColors = {
	red: 'rgb(255, 99, 132)',
	orange: 'rgb(255, 159, 64)',
	yellow: 'rgb(255, 205, 86)',
	green: 'rgb(75, 192, 192)',
	blue: 'rgb(54, 162, 235)',
	purple: 'rgb(153, 102, 255)',
	grey: 'rgb(201, 203, 207)'
};

class Stats {
    constructor(name) {
        this.hourlyStats = {};
    }

    addStat(data) {
        // get hour stamp and check if we have an hourly entry
        // we need atleast a timestamp to create an entry
        if (data['time'] === undefined) {
             return false;
        }

        // skip entries for:
        // "Apache/2.4.25 (FreeBSD) (internal dummy connection)"
        // 408 timeouts as the are health checks from AWS
        //if ((data["remoteHost"].indexOf("172.31") !== -1 && data["status"] == 408) || (data["RequestHeader User-Agent"].indexOf("internal dummy connection") !== -1))
        //    return false;

        var hour_stamp = data["time"];
        hour_stamp = hour_stamp.substring(0, hour_stamp.lastIndexOf(':') - 2) + "00";

        if (!(hour_stamp in this.hourlyStats)) {
            this.hourlyStats[hour_stamp] = new HourlyStats(hour_stamp, 0, 0, 0, 0, 0, 0);
        }

        this.hourlyStats[hour_stamp].addStatus(data["status"]);
        this.hourlyStats[hour_stamp].addIp(data["RequestHeader X-Forwarded-For"]);
        this.hourlyStats[hour_stamp].addRequest();
        if (!isNaN(data["sizeCLF"])) {
            this.hourlyStats[hour_stamp].addSize(parseInt(data["sizeCLF"]));            
        }        
        if (!isNaN(data["serveTime"])) {        
          this.hourlyStats[hour_stamp].addTime(parseInt(data["serveTime"]));        
        } 

        return true;
    }

    getTotalStats(totalStats) {
        totalStats.totalRequests = 0;
        totalStats.totalSize = 0;
        totalStats.totalTime = 0;
        totalStats.total200s = 0;
        totalStats.total300s = 0;        
        totalStats.total400s = 0;        

        for (var key in this.hourlyStats) {
            if (this.hourlyStats.hasOwnProperty(key)) {
                totalStats.totalRequests += this.hourlyStats[key].totalRequests;
                totalStats.totalSize += this.hourlyStats[key].totalSize;
                totalStats.totalTime += this.hourlyStats[key].totalTime;
                totalStats.total200s += this.hourlyStats[key].total200s;                
                totalStats.total300s += this.hourlyStats[key].total300s;                
                totalStats.total400s += this.hourlyStats[key].total400s;                                                
            }
        }
    }

    getChartDataByHour(chartData) {
        chartData.timeStamps = [];
        chartData.requests = [];
        chartData.averageTime = [];
        chartData.totalSize = [];
        chartData.total200s = [];        
        chartData.total300s = [];        
        chartData.total400s = [];                        

        for (var key in this.hourlyStats) {
            if (this.hourlyStats.hasOwnProperty(key)) {
                chartData.timeStamps.push(key);
                chartData.requests.push(this.hourlyStats[key].totalRequests);
                chartData.averageTime.push(this.hourlyStats[key].totalTime / this.hourlyStats[key].totalRequests);
                chartData.totalSize.push(this.hourlyStats[key].totalSize);
                chartData.total200s.push(this.hourlyStats[key].total200s);                
                chartData.total300s.push(this.hourlyStats[key].total300s);                
                chartData.total400s.push(this.hourlyStats[key].total400s);                                                
            }
        }
    }

    getTotalRequests() {
        var count = 0;
        for (var key in this.hourlyStats) {        
            count += this.hourlyStats[key].totalRequests;
        }

        return count;
    }

    getTotalUniqueIps() {
        var count = 0;
        for (var key in this.hourlyStats) {        
            count += this.hourlyStats[key].uniqueIps.length;
        }

        return count;
    }

    getTotalBandwidth() {
        var bandwidth = 0;

        for (var key in this.hourlyStats) { 
            bandwidth += this.hourlyStats[key].totalSize;
        }

        return bandwidth;        
    }

    getAvgRequestTime() {
        var requestTime = 0;
        var requests = 0;

        for (var key in this.hourlyStats) {        
            requestTime += this.hourlyStats[key].totalTime;
            requests += this.hourlyStats[key].totalRequests;            
        }

        return requestTime / requests;        

    }

    getTotal200s() {
        var count = 0;
        for (var key in this.hourlyStats) {        
            count += this.hourlyStats[key].total200s;
        }

        return count;
    }
    
    getTotal300s() {
        var count = 0;
        for (var key in this.hourlyStats) {        
            count += this.hourlyStats[key].total300s;
        }

        return count;
    }

    getTotal400s() {
        var count = 0;
        for (var key in this.hourlyStats) {        
            count += this.hourlyStats[key].total400s;
        }

        return count;
    }

    getStartDateRange() {
        if (Object.keys(this.hourlyStats).length > 0) {
          return (Object.keys(this.hourlyStats)[0]).replace(':', ' ') + ':00';
        }
    }

    getEndDateRange() {
        if (Object.keys(this.hourlyStats).length > 0) {
          return (Object.keys(this.hourlyStats)[Object.keys(this.hourlyStats).length - 1]).replace(':', ' ') + ':00';
        }        
    }    
}

class HourlyStats {
  constructor(timeset, totalRequests, totalTime, totalSize, total200s, total300s, total400s) {
    this.timeset = timeset;
    this.totalRequests = totalRequests;
    this.totalTime = totalTime;
    this.totalSize = totalSize;
    this.total200s = total200s;
    this.total300s = total300s;
    this.total400s = total400s;        
    this.uniqueIps = [];
  }
  
  totalRequests() {
    return this.totalRequests;
  }

  totalTime() {
      return this.totalTime;
  }

  totalSize() {
      return this.totalSize;
  }

  total200s() {
      return this.total200s;
  }
   
  total300s() {
      return this.total300s;
  }
    
  total400s() {
      return this.total400s;
  }

  addRequest() {
      this.totalRequests += 1;
  }

  addTime(requestTime) {
      this.totalTime += requestTime;
  }

  addSize(requestSize) {
      this.totalSize += (requestSize / 1000000);
  }

  addIp(ip) {
    if (ip != "-" && !this.uniqueIps.includes(ip)) {
        this.uniqueIps.push(ip);
    }
  }

  addStatus(status) {
      if (status >= 200 && status <= 299) {
          this.total200s += 1;
      }
      if (status >= 300 && status <= 399) {
          this.total300s += 1;
      }
      if (status >= 400 && status <= 499) {
          this.total400s += 1;
      }                
  }

  averageTime() {
    return this.totalTime / this.totalRequests;
  }

  averageSize() {
    return this.totalSize / this.totalRequests;
  }

  totalUniqueIp() {
    return this.uniqueIps.length;
  }
}

window.onload = function() {

    if (store.has('lastLogFormat')) {
        document.getElementById('logFormat').value = store.get('lastLogFormat');
    }
    
    if (store.has('lastSftpIpAddress')) {
        document.getElementById('sftpIPAddress').value = store.get('lastSftpIpAddress');            
    }

    if (store.has('lastSftpPort')) {
        document.getElementById('sftpPort').value = store.get('lastSftpPort');            
    }
    
    if (store.has('lastSftpUserName')) {
        document.getElementById('sftpUserName').value = store.get('lastSftpUserName');            
    }

    if (store.has('lastSftpLogFormat')) {
        document.getElementById('sftpLogFormat').value = store.get('lastSftpLogFormat');            
    }    

    if (store.has('lastSftpLogPath')) {
        document.getElementById('sftpLogPath').value = store.get('lastSftpLogPath');            
    }        

    if (store.has('lastSftpLogFileName')) {
        document.getElementById('sftpLogFileName').value = store.get('lastSftpLogFileName');            
    }        

  document.getElementById('sidebar-logsetup').onclick = function() {
    document.getElementById('sidebar-logsetup').classList.add('active');
    document.getElementById('sidebar-report').classList.remove('active');    
    document.getElementById('page-loadlog').classList.remove('hidden');    
    document.getElementById('page-chart').classList.add('hidden');        
  }

  document.getElementById('sidebar-report').onclick = function() {
    document.getElementById('sidebar-logsetup').classList.remove('active');
    document.getElementById('sidebar-report').classList.add('active');     
    document.getElementById('page-loadlog').classList.add('hidden');    
    document.getElementById('page-chart').classList.remove('hidden');                 
  }

  var updateDataInterval = null;
  var data_stats = new Stats('monodukuri');
  var totalBytesRead = 0;
  var reading = false;
  var requestChart = null;
  var avgTimeChart = null;
  var totalSizeChart = null;
  var statusCodesChart = null;
  var fullViewChart = null;

  function setLastModifiedNow() {
    var lastModified = document.getElementById("date-last-updated");            
    lastModified.innerHTML = new Date().toLocaleString();
  }

  function updatedDateRange() {    
    var startDateRange = document.getElementById("date-range-start");            
    startDateRange.innerHTML = data_stats.getStartDateRange();

    var endDateRange = document.getElementById("date-range-end");            
    endDateRange.innerHTML = data_stats.getEndDateRange();        
  }

  function createCharts() {
    var color = Chart.helpers.color;
    var chartData = { timeStamps: [], requests: [], averageTime: [], totalSize: [] };          
    data_stats.getChartDataByHour(chartData);

    var ctx = document.getElementById("requestChart").getContext('2d');
    requestChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.timeStamps,
            datasets: [{
                label: "Requests",
                data: chartData.requests,
                backgroundColor: color(window.chartColors.red).alpha(0.5).rgbString(),
                borderColor: window.chartColors.red,
                borderWidth: 1,                
            }]
        },
        options: {
            responsive: true,
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Number of Requests Report'
            },            
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        parser: 'DD/MMM/YYYY:HH:mm',
                    }
                }],
            },
        }
    });                

    var ctx = document.getElementById("avgTimeChart").getContext('2d');
    avgTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.timeStamps,
            datasets: [{
                label: "Request Time",
                data: chartData.averageTime,
                backgroundColor: color(window.chartColors.blue).alpha(0.5).rgbString(),
                borderColor: window.chartColors.blue,
                borderWidth: 1,                
            }]
        },
        options: {
            responsive: true,
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Average Request Time Report'
            },            
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        parser: 'DD/MMM/YYYY:HH:mm',
                    }
                }],
            },
        }
    });
    
    var ctx = document.getElementById("totalSizeChart").getContext('2d');
    totalSizeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.timeStamps,
            datasets: [{
                label: "Request Size",
                data: chartData.totalSize,
                backgroundColor: color(window.chartColors.yellow).alpha(0.5).rgbString(),
                borderColor: window.chartColors.yellow,
                borderWidth: 1,                
            }]
        },
        options: {
            responsive: true,
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Total Requests Report'
            },                        
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        parser: 'DD/MMM/YYYY:HH:mm',
                    }
                }],
            },
        }
    });            

    var ctx = document.getElementById("statusCodesChart").getContext('2d');
    statusCodesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.timeStamps,
            datasets: [
                {
                    label: "200 Status Codes",
                    backgroundColor: color(window.chartColors.red).alpha(0.5).rgbString(),
                    borderColor: window.chartColors.red,
                    borderWidth: 1,
                    data: chartData.total200s,
                },
                {
                    label: "300 Status Codes",
                    backgroundColor: color(window.chartColors.blue).alpha(0.5).rgbString(),
                    borderColor: window.chartColors.blue,                    
                    borderWidth: 1,                    
                    data: chartData.total300s,
                },
                {
                    label: "400 Status Codes",
                    backgroundColor: color(window.chartColors.yellow).alpha(0.5).rgbString(),
                    borderColor: window.chartColors.yellow,                    
                    borderWidth: 1,                    
                    data: chartData.total400s,
                }                                
            ]
        },
        options: {
            responsive: true,
            legend: {
                position: 'top',
            },
            tooltips: {
                mode: 'index',
                intersect: false
            },            
            title: {
                display: true,
                text: 'Status Codes Report'
            },
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        parser: 'DD/MMM/YYYY:HH:mm',
                    }
                }],
            },
        }
    });

    
    var ctx = document.getElementById("fullViewChart").getContext('2d');
    fullViewChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.timeStamps,
            datasets: [
                {
                    yAxisID: "y-axis-0",
                    label: "Number of Requests",
                    data: chartData.requests,
                    backgroundColor: color(window.chartColors.red).alpha(0.5).rgbString(),
                    borderColor: window.chartColors.red,                    
                    borderWidth: 1,                    
                },
                {
                    yAxisID: "y-axis-1",
                    label: "Average Request Time",
                    data: chartData.averageTime,
                    backgroundColor: color(window.chartColors.blue).alpha(0.5).rgbString(),
                    borderColor: window.chartColors.blue,                    
                    borderWidth: 1,                    
                },
            ]
        },
        options: {
            scales: {
                responsive: true,
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Number of Requests vs. Time Report'
                },                                
                yAxes: [
                    {
                        position: "left",
                        "id": "y-axis-0"
                    }, {
                        position: "right",
                        "id": "y-axis-1"
                    }
                ],                            
                xAxes: [
                    {
                        type: 'time',
                        time: {
                            parser: 'DD/MMM/YYYY:HH:mm',
                        }
                    }
                ],
            },
        }
    });               
  }

  function updateCharts() {
    var chartData = { timeStamps: [], requests: [], averageTime: [], totalSize: [] };          
    data_stats.getChartDataByHour(chartData);

    if (requestChart != null) {
        requestChart.data.datasets[0].data = chartData.requests;
        requestChart.data.labels = chartData.timeStamps;
        requestChart.update();
    }

    if (avgTimeChart != null) {
        avgTimeChart.data.datasets[0].data = chartData.averageTime;
        avgTimeChart.data.labels = chartData.timeStamps;
        avgTimeChart.update();
    }
    
    if (totalSizeChart != null) {
        totalSizeChart.data.datasets[0].data = chartData.totalSize;
        totalSizeChart.data.labels = chartData.timeStamps;
        totalSizeChart.update();
    }
    
    if (fullViewChart != null) {
        fullViewChart.data.datasets[0].data = chartData.requests;
        fullViewChart.data.datasets[1].data = chartData.averageTime;        
        fullViewChart.data.labels = chartData.timeStamps;
        fullViewChart.update();
    }                        
  }

  function setTopStats() {
    var statsTotalRequests = document.getElementById("grid-stats-total-requests");
    statsTotalRequests.innerHTML = data_stats.getTotalRequests();

    var statsUniqueVisitors = document.getElementById("grid-stats-unique-vistors");
    statsUniqueVisitors.innerHTML = data_stats.getTotalUniqueIps();

    var statsBandwidth = document.getElementById("grid-stats-bandwidth");
    var bandWidth = (data_stats.getTotalBandwidth()).toFixed(2);
    if (bandWidth < 1000) {
        statsBandwidth.innerHTML = bandWidth + " MB";
    }
    else {
        statsBandwidth.innerHTML = ((bandWidth / 1000).toFixed(2)) + " GB";
    }

    var statsDataRead = document.getElementById("grid-stats-data-processed");
    statsDataRead.innerHTML = (totalBytesRead / 1000000).toFixed(2) + " MB";    

    var statsAvgRequestTime = document.getElementById("grid-stats-avg-request-time");
    statsAvgRequestTime.innerHTML = (data_stats.getAvgRequestTime() / 1000000).toFixed(2) + " secs";        

    var statsFailedRequests = document.getElementById("grid-stats-failed-requests");
    statsFailedRequests.innerHTML = data_stats.getTotal400s();    
  }

  function loadDataSFTP(startPos, endPos) {
    var logPath = document.getElementById('sftpLogPath').value;
    var logFileName = document.getElementById('sftpLogFileName').value;
      
    promiseSftp.createReadStream(logPath + logFileName, {start: startPos, end: endPos, autoClose: true, encoding: 'UTF8'}).then(
        function(dataStream) {
            var sftpBytesRead = document.getElementById('sftpTotalBytesRead');
            var logFormat = document.getElementById('sftpLogFormat').value;
            var alpine = new Alpine(logFormat);
            alpine.parseReadStream(dataStream,
                function(data, bytesRead) {
                    if (data != null) {
                        if (data_stats.addStat(data)) {
                            totalBytesRead += data.originalLine.length;
                            previousLogSize += data.originalLine.length + 1;
                            sftpBytesRead.innerHTML = "Total bytes read = " + (totalBytesRead + 1);
                        }
                        else {
                            previousLogSize += data.originalLine.length + 1;                            
                        }
                    }
                    else {
                        updatedDateRange();
                        setLastModifiedNow();
                        setTopStats();

                        if (requestChart == null) {
                            createCharts();
                        }
                        else {
                            updateCharts();
                        }
                        reading = false;
                    }
                }
            );
        },
        function(err) {
            console.log(err);
            reading = false;
        }
    );
  }

  function updateData() {
      if (reading) {
          return;
      }

      var logPath = document.getElementById('sftpLogPath').value;
      var logFileName = document.getElementById('sftpLogFileName').value;

      promiseSftp.list(logPath).then(function(details) {
        details.forEach( function (record)
        {
            if (record.name == logFileName && record.size != previousLogSize) {
                console.log("Old log size= " + previousLogSize);
                console.log("New log size= " + record.size);
                reading = true;                
                loadDataSFTP(previousLogSize, record.size);
            }
        });
      },
      function(err) {
          console.log(err);
      }
    );
  }

  document.getElementById('btnConnectSftp').onclick = function() {
    var ipAddress = document.getElementById('sftpIPAddress').value;
    var port = document.getElementById('sftpPort').value;
    var userName = document.getElementById('sftpUserName').value;
    var keyFile = document.getElementById('sftpKeyFile').files[0].path;            
    var logFormat = document.getElementById('sftpLogFormat').value;
    var logPath = document.getElementById('sftpLogPath').value;
    var logFileName = document.getElementById('sftpLogFileName').value;


    store.set('lastSftpIpAddress', ipAddress);    
    store.set('lastSftpPort', port);    
    store.set('lastSftpUserName', userName);      
    store.set('lastSftpLogFormat', logFormat);  
    store.set('lastSftpLogPath', logPath);  
    store.set('lastSftpLogFileName', logFileName);          

    var status = promiseSftp.getConnectionStatus();
    if (status == "connected") {
        promiseSftp.end().then((status) => {
            if (!status) {
                document.getElementById('btn-loading-rotate').classList.add('hidden');        
                document.getElementById('btn-loading-static').classList.remove('hidden');                
                document.getElementById('btn-loading-connected').classList.add('hidden');                                
                
                document.getElementById('btnConnectSftp').classList.remove('btn-danger');      
                document.getElementById('btnConnectSftp').classList.remove('btn-success');            
                document.getElementById('btnConnectSftp').classList.add('btn-default');                
                document.getElementById('btnSSHLog').disabled = true;                
                document.getElementById('btnSSHLog').innerHTML = "Start Reading";
                clearInterval(updateDataInterval);
                updateDataInterval = null;                                                        
                console.log('disconnected');            
            }
            else {
                console.log('failed to disconnect');                            
            }
        },
        function(err) {
            console.log('failed to disconnect');                            
        });
    }
    else {
        document.getElementById('btn-loading-rotate').classList.remove('hidden');        
        document.getElementById('btn-loading-static').classList.add('hidden');                
        document.getElementById('btn-loading-connected').classList.add('hidden');                                

        promiseSftp.connect(
            {
                host: ipAddress,
                port: port,
                username: userName,
                privateKeyFile: keyFile,
            }
            ).then(() => {
                console.log('connected');
                document.getElementById('btn-loading-rotate').classList.add('hidden');        
                document.getElementById('btn-loading-static').classList.add('hidden');                
                document.getElementById('btn-loading-connected').classList.remove('hidden');                                
                
                document.getElementById('sftp-error').classList.add('hidden');
                document.getElementById('btnConnectSftp').classList.remove('btn-default');
                document.getElementById('btnConnectSftp').classList.remove('btn-danger');
                document.getElementById('btnConnectSftp').classList.add('btn-success');
                document.getElementById('btnSSHLog').disabled = false;
                document.getElementById('btnSSHLog').innerHTML = "Start Reading";
            },
            function(err) {
                document.getElementById('btn-loading-rotate').classList.add('hidden');        
                document.getElementById('btn-loading-static').classList.remove('hidden');                
                document.getElementById('btn-loading-connected').classList.add('hidden');                                
                
                var sftpError = document.getElementById('sftp-error');
                sftpError.innerHTML = err;
                sftpError.classList.remove('hidden');
                console.log(err);
                document.getElementById('btnConnectSftp').classList.remove('btn-default');
                document.getElementById('btnConnectSftp').classList.remove('btn-success');                        
                document.getElementById('btnConnectSftp').classList.add('btn-danger');                  
            }
        );
    }
  }

  document.getElementById('btnSSHLog').onclick = function() {
    var status = promiseSftp.getConnectionStatus();
    if (status == "connected") {
        if (updateDataInterval) {
            clearInterval(updateDataInterval);
            updateDataInterval = null;
            document.getElementById('btnSSHLog').innerHTML = "Start Reading";                        
        }
        else {
            updateDataInterval = setInterval(updateData, 10000);
            document.getElementById('btnSSHLog').innerHTML = "Stop Reading";            
        }   
    }
    else {
        document.getElementById('btnSSHLog').disabled = true;
    }
  }

  document.getElementById('btnLoadLog').onclick = function() {
    var logFile = document.getElementById('logInputFile').files[0].path;
    var logFileSize = document.getElementById('logInputFile').files[0].size;
    var logFormat = document.getElementById('logFormat').value;
    var alpine = new Alpine(logFormat);
    
    var div = document.getElementById("crash_reporters");    
    var uips_div = document.getElementById("unique_ips");        
    var load_progress = document.getElementById("load_progress");
     
    var ips = [];
    var totalStats = { totalRequests: 0, totalTime: 0, totalSize: 0 };
    var chartData = { timeStamps: [], requests: [], averageTime: [], totalSize: [] };    

    store.set('lastLogFormat', logFormat);    

    alpine.parseReadStream(fs.createReadStream(logFile, {encoding: "utf8"}), 
        function(data, bytesRead) {
            if (data == null) {
                load_progress.innerHTML = "Loading Complete";
                load_progress.style.width =  "100%";                
                load_progress.setAttribute("aria-valuenow","100%");
                data_stats.getTotalStats(totalStats);

                createCharts();
                updatedDateRange();
                setLastModifiedNow();
                setTopStats();
            }
            else {
                if (data_stats.addStat(data)) {
                    totalBytesRead += data.originalLine.length; 
                    var percentComplete = Math.trunc((totalBytesRead / logFileSize) * 100);
                    load_progress.style.width =  percentComplete + "%";
                    load_progress.setAttribute("aria-valuenow", percentComplete +"%");                
                }
            }

  });
  }
};