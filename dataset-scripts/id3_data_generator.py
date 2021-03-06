#!/usr/bin/python
import pandas as pd
import numpy as np
import sys
import math
import json
import os.path
from pprint import pprint
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--path', help= 'Path to csv file (_filtered_edited.csv)')
parser.add_argument('--limit', help= 'Row limit (e.g. 1000)')
args = parser.parse_args()

if args.path is not None:
    DATASET = args.path
else:
    DATASET = '../datasets/analysis_test_data/cvi_identified_filtered_edited.csv'

if args.limit is not None:
    ROW_LIMIT = args.limit
else:
    ROW_LIMIT = 1000

print('Generating ID3 data from csv dataset: "' + DATASET + '", with row limit ' + ROW_LIMIT + '\n')


if os.path.isdir("./decision-tree/"):
    OUTPUT_DIR = './decision-tree/'
elif os.path.isdir("../decision-tree/"):
    OUTPUT_DIR = '../decision-tree/'
else:
    OUTPUT_DIR = './'
OUTPUT = OUTPUT_DIR + 'data_input.sc'

DIRECTORY, BASENAME = os.path.split(DATASET)
BASENAME = os.path.splitext(BASENAME)[0]
MAPPED_VALUES = DIRECTORY + '/' + BASENAME + '_mapped_values.json'

def main():
    df=pd.read_csv(DATASET,sep=',')
    A = np.array(df)
    N = A.shape[0]
    N = min(N,ROW_LIMIT)
    M = A.shape[1]
    with open(OUTPUT,'w') as output:
        output.write('domain pd_shared3p shared3p' + ';' + '\n')
        output.write('uint64 rows = ' + str(N) + ';' + '\n')
        output.write('uint64 columns = ' + str(M) + ';' + '\n')
        json_data = json.load(open(MAPPED_VALUES))
        max_values = max([len(json_data[a].values()) for a in df.columns])
        output.write('uint64 max_attribute_values = ' + str(max_values) + ';' + '\n')
        output.write('uint64 class_index = columns-1' + ';' + '\n')
        output.write('pd_shared3p uint64[[1]] original_attributes(columns) = {' + ','.join([str(x) for x in list(range(M))]) + '};\n')
        output.write('/**' + '\n')
        for i in range(len(df.columns)):
            col = df.columns[i]
            output.write(' * '+ col + ' (' + str(i) + ') : ' + str(df[col].dtype) + ',' + '\n')
        output.write('**/' + '\n')
        array = '{'
        for i in range(N):
            for j in range(M):
                array += str(A[i,j]) + ','
        array = array[:-1]
        array += '}'
        var = 'pd_shared3p int64[[2]] original_examples(rows, columns)'
        command = 'reshape('+ array +', '+ str(N) +', '+ str(M) +');'
        output.write(var + ' = ' + command + '\n')
        var = 'pd_shared3p int64[[2]] possible_values(columns, max_attribute_values)'
        array = '{'
        for a in df.columns:
            attribute_values = json_data[a].values()
            attribute_values.sort()
            length = len(attribute_values)
            if length == 0:
                array += ','.join(['-1' for v in range(max_values)]) + ',' + '\n'
            else:
                padding = ',-1' * (max_values - length)
                array += ','.join([str(v) for v in attribute_values]) + padding + ',' + '\n'
        array = array[:-2]
        array += '}'
        command = 'reshape('+ array +', '+ 'columns' +', '+ 'max_attribute_values' +');'
        output.write(var + ' = ' + command + '\n')
    print('\nCreated file: "' + OUTPUT + '"')

if __name__ == '__main__':
    main()
