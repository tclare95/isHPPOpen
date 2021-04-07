import React from "react";
import Chart from "react-google-charts";

const chartArrayHeader = [
  { type: "datetime", label: "Date" },
  { type: "string", role: "annotation" },
  { type: "string", role: "annotationText" },
  { type: "number", label: "River Level" },
  { type: "number", label: "Normal Low" },
  { type: "number", label: "Cut Off" },
  { type: "number", label: "Forecast" },
];
let chartArray = [];

class ChartRender extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      dataLoadingStatus: "loading",
      chartData: chartArray,
    };
  }

  addRecordedData() {
    this.props.graphData.forEach((element) => {
      const newDate = element.reading_date;
      const newLevel = element.reading_level;
      const dateConvert = new Date(Date.parse(newDate));
      chartArray.push([
        dateConvert,
        null,
        null,
        newLevel,
        this.props.lowerBound,
        this.props.upperBound,
        null,
      ]);
    });
  }

  addForecastData() {
    this.props.graphForeCastData.forEach((element) => {
      const newDate = element.forecast_date;
      const newLevel = element.forecast_reading;
      const dateConvert = new Date(Date.parse(newDate));
      chartArray.push([
        dateConvert,
        null,
        null,
        null,
        this.props.lowerBound,
        this.props.upperBound,
        newLevel,
        
      ]);
    });
  }

  componentDidMount() {
    //recorded data graph entry
    this.addRecordedData();
    

    //forecast data graph entry
    this.addForecastData();
    
    //add headers, and add 'now' line
    const now = new Date();
    const nowArray = [now, "Now", null, null, null, null, null, ];
    chartArray.push(nowArray);

    // sort array to get the now line in the right place

    chartArray.sort((a, b) => b[0] - a[0])

    chartArray.unshift(chartArrayHeader);
  }

  render() {
    return (
      <Chart
        width={"100%"}
        height={350}
        chartType="ComboChart"
        loader={
          <div className="spinner-border" role="status">
            <span className="sr-only">Loading...</span>
          </div>
        }
        data={this.state.chartData}
        options={{
          intervals: { style: "sticks" },
          legend: {
            position: "bottom",
          },
          chartArea: {
            top: 10,
            right: 30,
            bottom: 50,
            left: 50,
            backgroundColor: {
              stroke: "#ccc",
              strokeWidth: 1,
            },
          },
          hAxis: {
            gridlines: {
              count: -1,
              units: {
                days: { format: ["E, d MMM", "d MMM"] },
                hours: { format: ["d MMM, haa"] },
              },
            },
            viewWindowMode: "maximized",
            textStyle: {
              bold: false,
            },
          },
          vAxis: {
            baseline: "automatic",
            gridlines: {
              count: 5,
            },
            format: "0.00m",
            textStyle: {
              bold: false,
            },
            titleTextStyle: {
              italic: false,
              bold: false,
            },
            viewWindowMode: "pretty",
          },
          series: {
            0: {pointSize: 3},
            1: {lineDashStyle:[2,2], tooltip : false},
            2: {lineDashStyle:[10,2], tooltip : false},
            3: {lineDashStyle:[4,2]}
          },
          colors: ["#1c91c0", "#6f9654", "#e2431e", "#FF6347"],
          annotations: {
            textStyle: {
              color: '#000000',
              fontSize: 13
            },
            alwaysOutside: true,
            stem: {
              color: '#000000',
              width: 6
            },
            style: 'line'
          },
          // crosshair: { trigger: 'both', orientation: 'horizontal', opacity: 0.3, },
          
        }}
      />
    );
  }

  componentDidUpdate(prevProps) {
    // Typical usage (don't forget to compare props):
    if (
      this.props.upperBound !== prevProps.upperBound ||
      this.props.lowerBound !== prevProps.lowerBound
    ) {
      const chartArrayHeader = [
        { type: "datetime", label: "Date" },
        { type: "string", role: "annotation" },
        { type: "string", role: "annotationText" },
        { type: "number", label: "River Level" },
        { type: "number", label: "Too Low" },
        { type: "number", label: "Too High" },
        { type: "number", label: "Forecast" },

      ];
      let chartArray = [];
      
      

      //rerun the chart draw

      //recorded data graph entry
      // this.addRecordedData();
      this.props.graphData.forEach((element) => {
        const newDate = element.reading_date;
        const newLevel = element.reading_level;
        const dateConvert = new Date(Date.parse(newDate));
        chartArray.push([
          dateConvert,
          null,
          null,
          newLevel,
          this.props.lowerBound,
          this.props.upperBound,
          null,
        ]);
      });
      //forecast data graph entry
      // this.addForecastData();
      this.props.graphForeCastData.forEach((element) => {
        const newDate = element.forecast_date;
        const newLevel = element.forecast_reading;
        const dateConvert = new Date(Date.parse(newDate));
        chartArray.push([
          dateConvert,
          null,
          null,
          null,
          this.props.lowerBound,
          this.props.upperBound,
          newLevel,
          
        ]);
      });
      //add headers, and add 'now' line
      chartArray.sort((a, b) => b[0] - a[0])
      const now = new Date();
      const nowArray = [now, "Now", null, null, null, null, null, ];
      chartArray.push(nowArray);
      chartArray.unshift(chartArrayHeader);
      this.setState({
        chartData: chartArray,
      });
    }
  }
  componentWillUnmount() {}
}

export default ChartRender;
