export default function VomitFactor (props) {
    let circleClass = 'align-middle rounded-circle d-inline-block circle ml-2 mt-2'
    if (props.currentLevel >= 1.8) {
        circleClass += ' bg-danger';
    } else if (props.currentLevel >= 1.5){
        circleClass += ' bg-warning';
    } else {
        circleClass += ' bg-success';
    }
        return(
            <div className={circleClass} data-toggle="tooltip" data-placement="top" title="Water Quality Indicator, click for info"></div>
        )
}