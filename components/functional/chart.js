import React from 'react';
import Chart from "react-google-charts";

const chartArrayHeader = 
[{type: 'datetime', label: 'Date'}, {type: 'number', label: 'River Level'}, {type: 'number', label: 'Normal Low'}, {type: 'number', label: 'Cut Off'}, {type: 'number', label: 'Forecast'}, {type: 'string', role: 'annotation'}];
const chartArray = [];
const now = new Date();
const nowArray = [now,null,null,null,null,'now']
chartArray.push(nowArray);

class ChartRender extends React.Component{
    constructor(props) {
        super(props);
        this.state = {
            dataLoadingStatus: 'loading',
            chartData: chartArray,
        }
    }
    componentDidMount() {
      //recorded data graph entry
        const readingArrayToLength = this.props.graphData
        const readingArrayLength = readingArrayToLength.length;
        for(let i=0; i < readingArrayLength; i++) {
            const newDate = this.props.graphData[i].reading_date;
            const newLevel = this.props.graphData[i].reading_level;
            const dateConvert = new Date(Date.parse(newDate))
            chartArray.push([dateConvert, newLevel, this.props.lowerBound, this.props.upperBound, null, null]);
        }
        //forecast data graph entry
        const forecastArrayToLength = this.props.graphForeCastData
        const forecastArrayLength = forecastArrayToLength.length;
        for(let i=0; i < forecastArrayLength; i++) {
          const newDate = this.props.graphForeCastData[i].forecast_date;
          const newLevel = this.props.graphForeCastData[i].forecast_reading;
          const dateConvert = new Date(Date.parse(newDate))
          chartArray.push([dateConvert, null , this.props.lowerBound, this.props.upperBound, newLevel, null]);
      }
      //add headers, and add 'now' line
       
        chartArray.unshift(chartArrayHeader);
        
    };
        
    render() {
        return(
            <Chart
    width={'100%'}
    height={350}
    chartType="ComboChart"
    loader={<div className="spinner-border" role="status">
    <span className="sr-only">Loading...</span>
  </div>}
    data={this.state.chartData}
    options={{
      intervals: { style: 'sticks' },
      legend: {
        position: 'bottom'},
      chartArea: {
        top: 10,
        right: 30,
        bottom: 50,
        left: 50,
        backgroundColor: {
          stroke: '#ccc',
          strokeWidth: 1
        }
      },
      hAxis: {
        gridlines: {
          count: -1,
          units: {
            days: { format: ['E, d MMM', 'd MMM'] },
            hours: { format: ['d MMM, haa'] }
          }
        },
        viewWindowMode: 'maximized',
        textStyle: {
          bold: false
        }
      },
      vAxis: {
        baseline: 'automatic',
        gridlines: {
          count: 5
        },
        format: '0.00m',
        textStyle: {
          bold: false
        },
        titleTextStyle: {
          italic: false,
          bold: false
        },
        viewWindowMode: 'pretty',
      },
      series: {
        0: {pointSize: 3},
        1: {lineDashStyle:[2,2], tooltip : false},
        2: {lineDashStyle:[10,2], tooltip : false},
        3: {lineDashStyle:[4,2]}
      },
      colors: ['#1c91c0', '#6f9654', '#e2431e', '#FF6347'],
      annotation: {
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
    

    }}
  />
        )
    }

    componentDidUpdate(prevProps) {
      // Typical usage (don't forget to compare props):
      if (this.props.upperBound !== prevProps.upperBound || this.props.lowerBound !== prevProps.lowerBound) {
        const chartArrayHeader = 
        [{type: 'datetime', label: 'Date'}, {type: 'number', label: 'River Level'}, {type: 'number', label: 'Too Low'}, {type: 'number', label: 'Too High'}, {type: 'number', label: 'Forecast'}, {type: 'string', role: 'annotation'}];
        const chartArray = [];
        const now = new Date();
        const nowArray = [now,null,null,null,null,'now']
        chartArray.push(nowArray);
        this.setState({
          chartData: chartArray
        })

        //rerun the chart draw

        //recorded data graph entry
        const readingArrayToLength = this.props.graphData
        const readingArrayLength = readingArrayToLength.length;
        for(let i=0; i < readingArrayLength; i++) {
            const newDate = this.props.graphData[i].reading_date;
            const newLevel = this.props.graphData[i].reading_level;
            const dateConvert = new Date(Date.parse(newDate))
            chartArray.push([dateConvert, newLevel, this.props.lowerBound, this.props.upperBound, null, null]);
        }
        //forecast data graph entry
        const forecastArrayToLength = this.props.graphForeCastData
        const forecastArrayLength = forecastArrayToLength.length;
        for(let i=0; i < forecastArrayLength; i++) {
          const newDate = this.props.graphForeCastData[i].forecast_date;
          const newLevel = this.props.graphForeCastData[i].forecast_reading;
          const dateConvert = new Date(Date.parse(newDate))
          chartArray.push([dateConvert, null , this.props.lowerBound, this.props.upperBound, newLevel, null]);
      }
      //add headers, and add 'now' line
       
        chartArray.unshift(chartArrayHeader);
      }
    }
    componentWillUnmount() {
      

    }  
}

export default ChartRender;