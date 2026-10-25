// Android vraagt om een widget te tekenen: bij plaatsen, van formaat veranderen en elk half uur.
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadWidgetData } from './data';
import { renderWidget } from './Widgets';

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget: render }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  const res = await loadWidgetData();
  render(renderWidget(widgetInfo.widgetName, res.view, widgetInfo.width, res.message));
}
