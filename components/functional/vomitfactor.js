export default function VomitFactor(props) {
  const currentLevel = props.levelData[0].reading_level;

  // changerate function
  const longChangeRate = () => {
    // if the rate in the last 24hr/48 is out of bounds,  is positive
    if (props.levelData[0].reading_level - props.levelData[96].reading_level > 0.3 || props.levelData[0].reading_level - props.levelData[192].reading_level > 0.25) {
      console.log("24/48 danger")
      // return "danger"
    } 
    else if (props.levelData[0].reading_level - props.levelData[96].reading_level > 0.1 || props.levelData[0].reading_level - props.levelData[192].reading_level > 0.1) {
      console.log("24/48 warning")
      // return "warning"
    } else {
      return false
    }
  }
  
  const changeRate =
    (((props.levelData[0].reading_level - props.levelData[4].reading_level)+(props.levelData[4].reading_level - props.levelData[8].reading_level)+(props.levelData[8].reading_level - props.levelData[12].reading_level)+(props.levelData[12].reading_level - props.levelData[16].reading_level)/4));
  let circleClass =
    "align-middle rounded-circle d-inline-block circle ml-2 mt-2";
  if (currentLevel >= 1.5 || changeRate > 0.3 || longChangeRate() === "danger") {
    circleClass += " bg-danger";
  } else if (currentLevel >= 1.3 || changeRate > 0.05 || longChangeRate() === "warning") {
    circleClass += " bg-warning";
  } else {
    circleClass += " bg-success";
  }
  return (
    <div
      className={circleClass}
      data-toggle="tooltip"
      data-placement="top"
      title={
        "Water Quality Indicator, click for info. Current change rate " +
        Math.round((changeRate + Number.EPSILON) * 100) / 100
      }
    ></div>
  );
}
