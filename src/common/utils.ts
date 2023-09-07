import { Editor, parseYaml } from "obsidian";
import type ObsidianFunctionPlot from "../main";
import type { Selection } from "d3";
import type {
  FunctionInputs,
  PlotInputs,
  rendererType,
  V1YAMLPlotInputs,
} from "./types";
import {
  DEFAULT_FUNCTION_INPUTS,
  DEFAULT_PLOT_INPUTS,
  FALLBACK_FUNCTION_INPUTS,
  FALLBACK_PLOT_INPUTS,
} from "./defaults";
import { toPng } from "html-to-image";
import type {
  FunctionPlotDatum,
  FunctionPlotOptions,
} from "function-plot/dist/types";
import { FunctionPlot } from "../fnplot";
import type { Chart } from "function-plot";

export function gcd(a: number, b: number): number {
  return !b ? a : gcd(b, a % b);
}

// TODO make change to returned object reflect in input
export function toFunctionPlotOptions(
  options: PlotInputs,
  target: HTMLElement
): FunctionPlotOptions {
  function functionInputsToFunctionPlotDatum(
    inputs: FunctionInputs
  ): FunctionPlotDatum {
    const output: FunctionPlotDatum = {
      fnType: inputs.fnType,
      graphType: inputs.graphType ?? undefined,
      fn: inputs.fnType === "linear" ? inputs.fn ?? undefined : undefined,
      scope:
        Object.keys(options.constants).length > 0
          ? (Object.keys(options.constants).reduce((acc, key) => {
              acc[key] = options.constants[key].value;
              return acc;
            }, {}) as unknown as { [_: string]: number })
          : undefined,
      vector:
        inputs.fnType === "vector" && inputs.vector.x && inputs.vector.y
          ? [inputs.vector.x, inputs.vector.y]
          : undefined,
      offset:
        inputs.fnType === "vector" &&
        (inputs.offset.x !== null || inputs.offset.y !== null)
          ? [
              inputs.offset.x ?? FALLBACK_FUNCTION_INPUTS.offset.x,
              inputs.offset.y ?? FALLBACK_FUNCTION_INPUTS.offset.y,
            ]
          : undefined,
      r: inputs.fnType === "polar" ? inputs.r ?? undefined : undefined,
      color: inputs.color ?? undefined,
      range:
        inputs.range.min || inputs.range.max
          ? [
              inputs.range.min ?? FALLBACK_FUNCTION_INPUTS.range.min,
              inputs.range.max ?? FALLBACK_FUNCTION_INPUTS.range.max,
            ]
          : undefined,
      nSamples: inputs.nSamples ? Math.min(inputs.nSamples, 999) : undefined,
      closed: inputs.closed ?? undefined,
      skipTip: inputs.skipTip ?? undefined,
    };

    Object.keys(output).forEach(
      (key) => output[key] === undefined && delete output[key]
    );

    return output;
  }

  function hasFunction(inputs: FunctionInputs): boolean {
    return Boolean(
      (inputs.fnType === "linear" && inputs.fn) ||
        (inputs.fnType === "vector" && inputs.vector.x && inputs.vector.y) ||
        (inputs.fnType === "polar" && inputs.r)
    );
  }

  const output: FunctionPlotOptions = {
    //id: options.id, //used by funcitonplot to identify the plot for updating
    target: target,
    data: options.data
      .filter(hasFunction)
      .map(functionInputsToFunctionPlotDatum),
    title: options.title ?? undefined,
    xAxis: {
      label: options.xAxis.label ?? FALLBACK_PLOT_INPUTS.xAxis.label,
      domain: [
        options.xAxis.domain.min ?? FALLBACK_PLOT_INPUTS.xAxis.domain.min,
        options.xAxis.domain.max ?? FALLBACK_PLOT_INPUTS.xAxis.domain.max,
      ],
    },
    yAxis: {
      label: options.yAxis.label ?? FALLBACK_PLOT_INPUTS.yAxis.label,
      domain: [
        options.yAxis.domain.min ?? FALLBACK_PLOT_INPUTS.yAxis.domain.min,
        options.yAxis.domain.max ?? FALLBACK_PLOT_INPUTS.yAxis.domain.max,
      ],
    },
    tip: {xLine: false, yLine: false, renderer(x, y, index) {
      // Purely cosmetic change
      return ((options.data[index].name) + " " || " ") + "( x: "+x.toFixed(3)+", y: "+y.toFixed(3)+" )";
    }},

    plugins: [(chart: Chart) => {
      // if legends are not enabled, do not display them
      if(!options.legends) return;

      // create a text svg element in the root function-plot element
      chart.root.append("g").attr("class", "top-left-legend");

      // Start organizing the data properly
      let legends: {name: string, color: string}[] = [];
      chart.options.data?.forEach((datum, index, arr) => {
        legends.push({name: (options.data[index].name) || "", color: datum.color || ""});
      })

      // Select the legend element, and place it accordingly to the top-right-legend.
      const tll: any = chart.root.select(".top-left-legend");
      tll.attr("transform", "translate("+ (chart.meta.margin?.left || 10) + ","+ ((chart.meta.margin?.top || 20) / 2) +")")

      // This is sort of a bugfix, so that the legends dont add up during the make-plot-modal
      tll.selectAll("text").remove();

      // We use rows, to make sure that if we have too many legends in a row, 
      // to make sure it dosent overlap with the title
      let rows: any[] = [];
      let current_row = -1;

      legends.forEach((legend, index, arr) => {

        if(index % 4 == 0){
          rows = rows.map((r, i, a) => {
            const dy = r.attr("dy");
            r.attr("dy", dy);
          })
          current_row += 1;
          rows.push(tll.append("text").attr("dx",0).attr("dy", current_row * 15));
          
        }

        rows[current_row].append("tspan").attr('fill', legend.color).attr("dx", 5).text("█ " + legend.name + "\n");
        
        

      }) 
    }],
    grid: options.grid ?? undefined,
    disableZoom: options.disableZoom ?? undefined,
  };

  Object.keys(output).forEach(
    (key) => output[key] === undefined && delete output[key]
  );

  return output;
}

export function hueToHexRGB(hue: number): string {
  const f = (n: number, k = (n + hue / 60) % 6) =>
    1 - Math.max(Math.min(k, 4 - k, 1), 0);
  return (
    "#" +
    [
      Math.round(f(5) * 255)
        .toString(16)
        .padStart(2, "0"),
      Math.round(f(3) * 255)
        .toString(16)
        .padStart(2, "0"),
      Math.round(f(1) * 255)
        .toString(16)
        .padStart(2, "0"),
    ].join("")
  );
}


/**
 * Insert the text as a new paragraph (newline before and after), and place the active cursor below.
 * @param editor The editor element
 * @param value The text to place
 */
export function insertParagraphAtCursor(
  plugin: ObsidianFunctionPlot,
  editor: Editor,
  value: string
) {
  editor.replaceRange(`\n${value}\n`, editor.getCursor());
}

/**
 * Insert an interactive plot at the current cursor position.
 * @param plugin A reference to the plugin
 * @param editor A reference to the active editor
 * @param options The options for the plot
 */
export function insertPlotAsInteractive(
  plugin: ObsidianFunctionPlot,
  editor: Editor,
  options: PlotInputs
): void {
  const text = `\`\`\`functionplot\n${JSON.stringify(
    Object.assign({}, options, { target: null })
  )}\n\`\`\``;
  insertParagraphAtCursor(plugin, editor, text);
}

/**
 * Render the plot as an image element using a data url.
 * @param plugin A reference to the plugin
 * @param editor A reference to the active editor
 * @param options The options for the plot
 */
export function insertPlotAsImage(
  plugin: ObsidianFunctionPlot,
  editor: Editor,
  options: PlotInputs
) {
  const target = document.createElement("div");
  const plot = new FunctionPlot(plugin);
  plot.target = target;
  plot.options = options;
  toPng(target)
    .then((dataURL) => {
      if (dataURL === "data:,") {
        new Error("Data URL is empty");
      }
      const text = `<img data-functionplot="${JSON.stringify(
        options
      )}" src="${dataURL}">`;
      target.remove();
      insertParagraphAtCursor(plugin, editor, text);
    })
    .catch((err) => {
      console.error(`Error converting to PNG: ${err}`);
    });
}

export function insertPlot(
  plugin: ObsidianFunctionPlot,
  editor: Editor,
  options: PlotInputs,
  renderer: rendererType
) {
  switch (renderer) {
    case "interactive":
      insertPlotAsInteractive(plugin, editor, options);
      break;
    case "image":
      insertPlotAsImage(plugin, editor, options);
      break;
  }
}

export function parseYAMLCodeBlock(content: string): PlotInputs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let header: V1YAMLPlotInputs = {},
    offset = 0;
  const headerMatch = content.match(/-{3}([^]*?)-{3}/)?.[1];
  if (headerMatch) {
    offset = headerMatch.length + 6;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    header = parseYaml(headerMatch);
  }
  const functions = content
    .slice(offset)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    constants: {},
    title: header.title ?? DEFAULT_PLOT_INPUTS.title,
    legends: false,
    xAxis: {
      label: header.xLabel ?? FALLBACK_PLOT_INPUTS.xAxis.label,
      domain: header.bounds
        ? { min: header.bounds[0], max: header.bounds[1] }
        : FALLBACK_PLOT_INPUTS.xAxis.domain,
    },
    yAxis: {
      label: header.yLabel ?? FALLBACK_PLOT_INPUTS.yAxis.label,
      domain: header.bounds
        ? { min: header.bounds[2], max: header.bounds[3] }
        : FALLBACK_PLOT_INPUTS.yAxis.domain,
    },
    disableZoom: header.disableZoom ?? DEFAULT_PLOT_INPUTS.disableZoom,
    grid: header.grid ?? DEFAULT_PLOT_INPUTS.grid,
    data: functions.map((f) => {
      const fn = /^[A-z]\([A-z]\) *= *(?=[0-z])([^]+?)$/.exec(f)?.[1] ?? f;

      return Object.assign({}, DEFAULT_FUNCTION_INPUTS, {
        fnType: "linear",
        graphType: "polyline",
        fn, // return as FunctionInputs since fn is specified here
      }) as FunctionInputs;
    }),
  };
}

export function parseCodeBlock(content: string): PlotInputs {
  try {
    return Object.assign(
      {},
      DEFAULT_PLOT_INPUTS,
      JSON.parse(content)
    ) as PlotInputs;
  } catch (err) {
    console.error(`Error while parsing code block in JSON mode: ${err}`);
    return parseYAMLCodeBlock(content);
  }
}
