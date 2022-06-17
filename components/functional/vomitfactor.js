export default function VomitFactor(props) {
  const currentLevel = props.levelData[0].reading_level;
  console.log(props.levelData)

  const changeRate =
    (((props.levelData[0].reading_level - props.levelData[4].reading_level)+(props.levelData[0].reading_level - props.levelData[4].reading_level)/2));
  let circleClass =
    "align-middle rounded-circle d-inline-block circle ml-2 mt-2";
  if (currentLevel >= 1.5 || changeRate > 0.3) {
    circleClass += " bg-danger";
  } else if (currentLevel >= 1.3 || changeRate > 0.05) {
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
