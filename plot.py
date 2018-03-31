import plotly
import plotly.graph_objs as go

with open('out.txt', 'r') as results:
    ai = 1
    for line in results:
        if line.startswith('{') and 'Histogram' in line:
            dimensions = [int(x) for x in (line[1:-(len('Histogram')+3)]).split(', ')]
            histogram = [int(x) for x in (next(results)[1:-2]).split(', ')]
            x = dimensions[0]
            y = dimensions[1]
            if len(dimensions) == 2 and 1 in dimensions:
                data = [go.Bar(y=histogram)]
                plotly.offline.plot(data, filename='1D_Histogram'+str(ai))
            elif len(dimensions) == 2 and 1 not in dimensions:
                sublists = [histogram[i:i+y] for i in xrange(0, len(histogram), y)]
                trace = go.Heatmap(z=sublists)
                data=[trace]
                plotly.offline.plot(data, filename='2D_Histogram'+str(ai))
            ai += 1

