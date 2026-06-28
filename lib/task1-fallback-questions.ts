import type { Task1QuestionData } from './task1-chart-schema'

const lineChartQuestions: Task1QuestionData[] = [
  {
    id: 'fb-line-population',
    taskType: 'task1',
    chartType: 'line_graph',
    title: 'Academic Task 1 - Line Chart',
    prompt: 'The line graph below shows the population growth of three major cities from 2000 to 2020.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'line',
      title: 'Population Growth of Major Cities (2000-2020)',
      xAxis: { label: 'Year', categories: ['2000', '2005', '2010', '2015', '2020'] },
      yAxis: { label: 'Population', unit: 'million' },
      series: [
        { id: 'tokyo', name: 'Tokyo', values: [34.4, 35.6, 36.8, 37.9, 39.1] },
        { id: 'london', name: 'London', values: [7.3, 7.8, 8.2, 8.7, 9.0] },
        { id: 'newyork', name: 'New York', values: [8.0, 8.2, 8.4, 8.6, 8.8] }
      ],
      legend: true
    }
  },
  {
    id: 'fb-line-energy',
    taskType: 'task1',
    chartType: 'line_graph',
    title: 'Academic Task 1 - Line Chart',
    prompt: 'The line graph below shows the percentage of electricity generated from renewable sources in four European countries between 2010 and 2025.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'line',
      title: 'Renewable Electricity Generation in Europe (2010-2025)',
      subtitle: 'Percentage of total electricity from renewable sources',
      xAxis: { label: 'Year', categories: ['2010', '2013', '2016', '2019', '2022', '2025'] },
      yAxis: { label: 'Share', unit: '%', min: 0, max: 100 },
      series: [
        { id: 'germany', name: 'Germany', values: [17, 25, 33, 42, 51, 58] },
        { id: 'france', name: 'France', values: [14, 16, 19, 24, 28, 35] },
        { id: 'spain', name: 'Spain', values: [35, 38, 40, 44, 48, 55] },
        { id: 'uk', name: 'UK', values: [7, 15, 25, 37, 48, 62] }
      ],
      legend: true,
      source: 'Eurostat (illustrative data)'
    }
  },
  {
    id: 'fb-line-temperature',
    taskType: 'task1',
    chartType: 'line_graph',
    title: 'Academic Task 1 - Line Chart',
    prompt: 'The line graph below shows average monthly temperatures in two cities over a twelve-month period.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'line',
      title: 'Average Monthly Temperatures',
      xAxis: { label: 'Month', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
      yAxis: { label: 'Temperature', unit: '°C' },
      series: [
        { id: 'sydney', name: 'Sydney', values: [26, 26, 24, 22, 18, 16, 15, 16, 19, 22, 24, 25] },
        { id: 'moscow', name: 'Moscow', values: [-6, -4, 2, 10, 17, 21, 23, 22, 15, 7, 1, -4] }
      ],
      legend: true
    }
  },
  {
    id: 'fb-line-internet',
    taskType: 'task1',
    chartType: 'line_graph',
    title: 'Academic Task 1 - Line Chart',
    prompt: 'The line graph below shows the percentage of households with internet access in five regions from 2012 to 2024.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'line',
      title: 'Household Internet Access by Region (2012-2024)',
      xAxis: { label: 'Year', categories: ['2012', '2015', '2018', '2021', '2024'] },
      yAxis: { label: 'Households', unit: '%', min: 0, max: 100 },
      series: [
        { id: 'north_america', name: 'North America', values: [72, 78, 85, 91, 95] },
        { id: 'europe', name: 'Europe', values: [68, 76, 83, 89, 93] },
        { id: 'east_asia', name: 'East Asia', values: [45, 58, 72, 85, 92] },
        { id: 'south_america', name: 'South America', values: [32, 42, 55, 68, 78] },
        { id: 'africa', name: 'Africa', values: [10, 16, 25, 36, 48] }
      ],
      legend: true
    }
  },
  {
    id: 'fb-line-spending',
    taskType: 'task1',
    chartType: 'line_graph',
    title: 'Academic Task 1 - Line Chart',
    prompt: 'The line graph below shows average consumer spending on three categories of goods in the UK between 2015 and 2025.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'line',
      title: 'UK Consumer Spending by Category (2015-2025)',
      subtitle: 'Average monthly expenditure per household',
      xAxis: { label: 'Year', categories: ['2015', '2017', '2019', '2021', '2023', '2025'] },
      yAxis: { label: 'Spending', unit: '£' },
      series: [
        { id: 'food', name: 'Food & Groceries', values: [320, 335, 350, 380, 410, 430] },
        { id: 'entertainment', name: 'Entertainment', values: [180, 210, 240, 190, 260, 290] },
        { id: 'clothing', name: 'Clothing', values: [120, 115, 110, 85, 105, 100] }
      ],
      legend: true
    }
  }
]

const barChartQuestions: Task1QuestionData[] = [
  {
    id: 'fb-bar-expenditure',
    taskType: 'task1',
    chartType: 'bar_chart',
    title: 'Academic Task 1 - Bar Chart',
    prompt: 'The bar chart below shows government expenditure on education and healthcare in five countries in 2020.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'bar',
      title: 'Government Expenditure on Education and Healthcare (2020)',
      subtitle: 'Percentage of GDP',
      xAxis: { label: 'Country', categories: ['USA', 'UK', 'Germany', 'Japan', 'Brazil'] },
      yAxis: { label: 'Expenditure', unit: '% of GDP' },
      series: [
        { id: 'education', name: 'Education', values: [5.4, 5.2, 4.6, 3.4, 6.1] },
        { id: 'healthcare', name: 'Healthcare', values: [16.8, 10.2, 11.7, 10.9, 9.6] }
      ],
      legend: true
    }
  },
  {
    id: 'fb-bar-coffee',
    taskType: 'task1',
    chartType: 'bar_chart',
    title: 'Academic Task 1 - Bar Chart',
    prompt: 'The bar chart below shows coffee consumption per capita in six countries in 2022.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'bar',
      title: 'Coffee Consumption Per Capita (2022)',
      xAxis: { label: 'Country', categories: ['Finland', 'Netherlands', 'Sweden', 'Germany', 'Brazil', 'USA'] },
      yAxis: { label: 'Consumption', unit: 'kg per year' },
      series: [
        { id: 'consumption', name: 'Annual Consumption', values: [12.0, 8.4, 8.2, 7.2, 6.1, 4.9] }
      ],
      legend: false
    }
  },
  {
    id: 'fb-bar-immigration',
    taskType: 'task1',
    chartType: 'bar_chart',
    title: 'Academic Task 1 - Bar Chart',
    prompt: 'The bar chart below shows the number of international students in four countries in 2015 and 2023.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'bar',
      title: 'International Students by Destination Country',
      subtitle: 'Thousands of students',
      xAxis: { label: 'Country', categories: ['USA', 'UK', 'Australia', 'Canada'] },
      yAxis: { label: 'Students', unit: 'thousands' },
      series: [
        { id: '2015', name: '2015', values: [975, 436, 270, 350] },
        { id: '2023', name: '2023', values: [1057, 605, 380, 620] }
      ],
      legend: true
    }
  },
  {
    id: 'fb-bar-waste',
    taskType: 'task1',
    chartType: 'bar_chart',
    title: 'Academic Task 1 - Bar Chart',
    prompt: 'The bar chart below shows the amount of waste recycled as a percentage of total waste in five cities in 2024.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'bar',
      title: 'Recycling Rates by City (2024)',
      xAxis: { label: 'City', categories: ['San Francisco', 'Ljubljana', 'Kamikatsu', 'Taipei', 'Milan'] },
      yAxis: { label: 'Recycling Rate', unit: '%', min: 0, max: 100 },
      series: [
        { id: 'rate', name: 'Recycling Rate', values: [80, 68, 81, 60, 52] }
      ],
      legend: false
    }
  },
  {
    id: 'fb-bar-tourism',
    taskType: 'task1',
    chartType: 'bar_chart',
    title: 'Academic Task 1 - Bar Chart',
    prompt: 'The bar chart below shows the number of international tourist arrivals in six regions in 2019 and 2023.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'bar',
      title: 'International Tourist Arrivals by Region',
      subtitle: 'Millions of arrivals',
      xAxis: { label: 'Region', categories: ['Europe', 'Asia-Pacific', 'Americas', 'Middle East', 'Africa', 'South Asia'] },
      yAxis: { label: 'Arrivals', unit: 'million' },
      series: [
        { id: '2019', name: '2019', values: [745, 360, 217, 60, 72, 30] },
        { id: '2023', name: '2023', values: [700, 300, 190, 85, 65, 35] }
      ],
      legend: true
    }
  }
]

const pieChartQuestions: Task1QuestionData[] = [
  {
    id: 'fb-pie-energy-mix',
    taskType: 'task1',
    chartType: 'pie_chart',
    title: 'Academic Task 1 - Pie Chart',
    prompt: 'The pie charts below show the main sources of energy production in a country in 2005 and 2025.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'pie',
      title: 'Energy Production Sources (2025)',
      pieData: [
        { label: 'Natural Gas', value: 35 },
        { label: 'Renewables', value: 28 },
        { label: 'Nuclear', value: 18 },
        { label: 'Coal', value: 12 },
        { label: 'Oil', value: 7 }
      ],
      legend: true
    }
  },
  {
    id: 'fb-pie-household',
    taskType: 'task1',
    chartType: 'pie_chart',
    title: 'Academic Task 1 - Pie Chart',
    prompt: 'The pie chart below shows how an average household in a European country allocates its monthly income.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'pie',
      title: 'Average Household Monthly Expenditure',
      pieData: [
        { label: 'Housing & Utilities', value: 32 },
        { label: 'Food & Groceries', value: 22 },
        { label: 'Transport', value: 15 },
        { label: 'Healthcare', value: 10 },
        { label: 'Education', value: 8 },
        { label: 'Entertainment', value: 7 },
        { label: 'Other', value: 6 }
      ],
      legend: true
    }
  },
  {
    id: 'fb-pie-waste-type',
    taskType: 'task1',
    chartType: 'pie_chart',
    title: 'Academic Task 1 - Pie Chart',
    prompt: 'The pie chart below shows the composition of municipal solid waste in a major city in 2024.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'pie',
      title: 'Municipal Solid Waste Composition (2024)',
      pieData: [
        { label: 'Organic Waste', value: 35 },
        { label: 'Paper & Cardboard', value: 25 },
        { label: 'Plastics', value: 15 },
        { label: 'Glass', value: 8 },
        { label: 'Metals', value: 7 },
        { label: 'Textiles', value: 5 },
        { label: 'Other', value: 5 }
      ],
      legend: true
    }
  },
  {
    id: 'fb-pie-transport',
    taskType: 'task1',
    chartType: 'pie_chart',
    title: 'Academic Task 1 - Pie Chart',
    prompt: 'The pie chart below shows how commuters in a large city travel to work in 2024.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'pie',
      title: 'Commuting Methods in a Large City (2024)',
      pieData: [
        { label: 'Private Car', value: 38 },
        { label: 'Public Transport', value: 30 },
        { label: 'Bicycle', value: 12 },
        { label: 'Walking', value: 10 },
        { label: 'Working from Home', value: 7 },
        { label: 'Other', value: 3 }
      ],
      legend: true
    }
  },
  {
    id: 'fb-pie-education',
    taskType: 'task1',
    chartType: 'pie_chart',
    title: 'Academic Task 1 - Pie Chart',
    prompt: 'The pie chart below shows the distribution of international students by region of origin in a UK university in 2023.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'pie',
      title: 'International Students by Region of Origin (2023)',
      subtitle: 'UK University Sample',
      pieData: [
        { label: 'East Asia', value: 32 },
        { label: 'South Asia', value: 25 },
        { label: 'Europe (non-UK)', value: 18 },
        { label: 'Middle East', value: 10 },
        { label: 'Africa', value: 8 },
        { label: 'Americas', value: 5 },
        { label: 'Oceania', value: 2 }
      ],
      legend: true
    }
  }
]

const tableQuestions: Task1QuestionData[] = [
  {
    id: 'fb-table-living-cost',
    taskType: 'task1',
    chartType: 'table',
    title: 'Academic Task 1 - Table',
    prompt: 'The table below shows the average cost of living in five major cities in 2024.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'table',
      title: 'Average Monthly Cost of Living (2024)',
      subtitle: 'US dollars per month',
      tableData: {
        columns: ['City', 'Rent (1-bed)', 'Groceries', 'Transport', 'Utilities', 'Total'],
        rows: [
          ['Singapore', 2200, 450, 120, 150, 2920],
          ['London', 2000, 380, 180, 200, 2760],
          ['New York', 2800, 420, 130, 180, 3530],
          ['Tokyo', 1100, 350, 100, 120, 1670],
          ['Sydney', 1800, 400, 150, 170, 2520]
        ]
      },
      source: 'Numbeo Cost of Living Index (illustrative)'
    }
  },
  {
    id: 'fb-table-education',
    taskType: 'task1',
    chartType: 'table',
    title: 'Academic Task 1 - Table',
    prompt: 'The table below compares key education statistics for five countries in 2023.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'table',
      title: 'Education Statistics by Country (2023)',
      tableData: {
        columns: ['Country', 'Literacy Rate (%)', 'University Enrollment (%)', 'Govt Spending (% GDP)', 'Student-Teacher Ratio'],
        rows: [
          ['Finland', 100, 93, 6.3, 13],
          ['South Korea', 99, 98, 4.5, 16],
          ['Brazil', 93, 55, 6.1, 21],
          ['India', 77, 31, 3.1, 26],
          ['Nigeria', 62, 10, 1.0, 36]
        ]
      }
    }
  },
  {
    id: 'fb-table-transport',
    taskType: 'task1',
    chartType: 'table',
    title: 'Academic Task 1 - Table',
    prompt: 'The table below shows the average daily commute times and preferred transport modes in four cities in 2024.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'table',
      title: 'Daily Commute Statistics by City (2024)',
      tableData: {
        columns: ['City', 'Avg. Commute (min)', 'Car (%)', 'Public Transport (%)', 'Cycle/Walk (%)'],
        rows: [
          ['Los Angeles', 62, 73, 12, 5],
          ['Amsterdam', 38, 22, 35, 40],
          ['Beijing', 52, 33, 50, 10],
          ['Bogotá', 67, 28, 55, 12]
        ]
      }
    }
  },
  {
    id: 'fb-table-health',
    taskType: 'task1',
    chartType: 'table',
    title: 'Academic Task 1 - Table',
    prompt: 'The table below shows health indicators for six countries in 2023.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'table',
      title: 'Health Indicators by Country (2023)',
      tableData: {
        columns: ['Country', 'Life Expectancy', 'Infant Mortality (per 1000)', 'Doctors (per 1000)', 'Health Spending (% GDP)'],
        rows: [
          ['Japan', 84.8, 1.8, 2.6, 11.0],
          ['Switzerland', 83.4, 3.5, 4.4, 11.8],
          ['Australia', 83.0, 3.1, 3.8, 10.2],
          ['USA', 77.5, 5.4, 2.6, 17.8],
          ['Brazil', 75.9, 13.3, 2.3, 9.6],
          ['India', 70.8, 27.8, 0.7, 3.5]
        ]
      }
    }
  },
  {
    id: 'fb-table-housing',
    taskType: 'task1',
    chartType: 'table',
    title: 'Academic Task 1 - Table',
    prompt: 'The table below compares average house prices and salary-to-price ratios in five cities in 2015 and 2025.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'table',
      title: 'House Prices and Affordability (2015 vs 2025)',
      subtitle: 'Average house price in thousands of local currency',
      tableData: {
        columns: ['City', 'Price 2015', 'Price 2025', 'Salary Ratio 2015', 'Salary Ratio 2025'],
        rows: [
          ['London', 350, 520, 11.2, 14.8],
          ['Sydney', 650, 1050, 9.8, 13.5],
          ['Toronto', 420, 780, 7.5, 11.2],
          ['Berlin', 200, 380, 5.2, 7.8],
          ['Dubai', 450, 520, 5.8, 5.5]
        ]
      }
    }
  }
]

const mixedChartQuestions: Task1QuestionData[] = [
  {
    id: 'fb-mixed-bar-pie-retail',
    taskType: 'task1',
    chartType: 'mixed_charts',
    title: 'Academic Task 1 - Mixed Chart',
    prompt: 'The charts below show the revenue of a retail company by region in 2024 and the percentage distribution of its operating costs in the same year.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'mixed',
      title: 'Retail Company Revenue and Operating Costs (2024)',
      charts: [
        {
          chartType: 'bar',
          title: 'Revenue by Region',
          xAxis: { label: 'Region', categories: ['North America', 'Europe', 'Asia', 'South America'] },
          yAxis: { label: 'Revenue', unit: '$ million' },
          series: [
            { id: 'revenue', name: 'Revenue', type: 'bar', values: [128, 96, 112, 54] }
          ],
          units: '$ million',
          legend: true
        },
        {
          chartType: 'pie',
          title: 'Distribution of Operating Costs',
          pieData: [
            { label: 'Staff', value: 38 },
            { label: 'Property', value: 24 },
            { label: 'Marketing', value: 18 },
            { label: 'Logistics', value: 12 },
            { label: 'Other', value: 8 }
          ],
          units: '%',
          legend: true
        }
      ],
      legend: true
    }
  },
  {
    id: 'fb-mixed-line-table-enrollment',
    taskType: 'task1',
    chartType: 'mixed_charts',
    title: 'Academic Task 1 - Mixed Chart',
    prompt: 'The line chart below shows total university enrolment in Australia from 2015 to 2025, while the table gives the proportion of international students at four universities in 2025.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'mixed',
      title: 'University Enrolment in Australia',
      charts: [
        {
          chartType: 'line',
          title: 'Total University Enrolment (2015-2025)',
          xAxis: { label: 'Year', categories: ['2015', '2017', '2019', '2021', '2023', '2025'] },
          yAxis: { label: 'Students', unit: 'thousands' },
          series: [
            { id: 'enrolment', name: 'Total enrolment', type: 'line', values: [1400, 1500, 1560, 1480, 1600, 1680] }
          ],
          units: 'thousands',
          legend: true
        },
        {
          chartType: 'table',
          title: 'International Students by University (2025)',
          tableData: {
            columns: ['University', 'International students'],
            rows: [
              ['University A', '34%'],
              ['University B', '29%'],
              ['University C', '25%'],
              ['University D', '18%']
            ]
          },
          units: '%',
          legend: false
        }
      ],
      legend: true
    }
  },
  {
    id: 'fb-mixed-bar-line-exports',
    taskType: 'task1',
    chartType: 'mixed_charts',
    title: 'Academic Task 1 - Mixed Chart',
    prompt: 'The charts below show the volume and unit price of a country\'s agricultural exports between 2016 and 2024.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    chartSpec: {
      kind: 'mixed',
      title: 'Agricultural Export Performance (2016-2024)',
      charts: [
        {
          chartType: 'bar',
          title: 'Export Volume',
          xAxis: { label: 'Year', categories: ['2016', '2018', '2020', '2022', '2024'] },
          yAxis: { label: 'Volume', unit: 'million tonnes' },
          series: [
            { id: 'volume', name: 'Export volume', type: 'bar', values: [42, 48, 45, 55, 60] }
          ],
          units: 'million tonnes',
          legend: true
        },
        {
          chartType: 'line',
          title: 'Average Unit Price',
          xAxis: { label: 'Year', categories: ['2016', '2018', '2020', '2022', '2024'] },
          yAxis: { label: 'Price', unit: '$ per tonne' },
          series: [
            { id: 'price', name: 'Unit price', type: 'line', values: [280, 310, 350, 420, 390] }
          ],
          units: '$ per tonne',
          legend: true
        }
      ],
      legend: true
    }
  }
]

const processQuestions: Task1QuestionData[] = [
  {
    id: 'fb-process-water',
    taskType: 'task1',
    chartType: 'process',
    title: 'Academic Task 1 - Process Diagram',
    prompt: 'The diagram below illustrates how rainwater is collected and treated for household use in a coastal town.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    processSpec: {
      title: 'Rainwater Collection and Treatment Process',
      stages: [
        { id: 'collect', label: 'Collection', description: 'Rainwater is collected from rooftops via gutters' },
        { id: 'filter', label: 'Filtration', description: 'Water passes through sand and gravel filters' },
        { id: 'store', label: 'Storage', description: 'Filtered water is stored in underground tanks' },
        { id: 'treat', label: 'Treatment', description: 'UV light and chlorine are used to purify the water' },
        { id: 'test', label: 'Testing', description: 'Water quality is tested daily' },
        { id: 'supply', label: 'Supply', description: 'Clean water is pumped to households' }
      ]
    }
  },
  {
    id: 'fb-process-recycling',
    taskType: 'task1',
    chartType: 'process',
    title: 'Academic Task 1 - Process Diagram',
    prompt: 'The diagram below shows the process of recycling plastic bottles.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    processSpec: {
      title: 'Plastic Bottle Recycling Process',
      stages: [
        { id: 'collect', label: 'Collection', description: 'Used bottles are collected from recycling bins' },
        { id: 'sort', label: 'Sorting', description: 'Bottles are sorted by plastic type using sensors' },
        { id: 'clean', label: 'Cleaning', description: 'Labels are removed and bottles are washed' },
        { id: 'shred', label: 'Shredding', description: 'Bottles are shredded into small flakes' },
        { id: 'melt', label: 'Melting', description: 'Flakes are melted and formed into pellets' },
        { id: 'produce', label: 'Production', description: 'Pellets are used to make new products' }
      ]
    }
  },
  {
    id: 'fb-process-brick',
    taskType: 'task1',
    chartType: 'process',
    title: 'Academic Task 1 - Process Diagram',
    prompt: 'The diagram below illustrates the stages in the production of bricks.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    processSpec: {
      title: 'Brick Manufacturing Process',
      stages: [
        { id: 'dig', label: 'Excavation', description: 'Clay is dug from the ground' },
        { id: 'mix', label: 'Mixing', description: 'Clay is mixed with water and sand' },
        { id: 'mould', label: 'Moulding', description: 'The mixture is pressed into brick shapes' },
        { id: 'dry', label: 'Drying', description: 'Bricks are dried in a kiln at 200-1000°C' },
        { id: 'cool', label: 'Cooling', description: 'Bricks are slowly cooled to prevent cracking' },
        { id: 'pack', label: 'Packaging', description: 'Finished bricks are stacked and packaged for delivery' }
      ]
    }
  }
]

const mapQuestions: Task1QuestionData[] = [
  {
    id: 'fb-map-river-crossing',
    taskType: 'task1',
    chartType: 'map',
    title: 'Academic Task 1 - Map',
    prompt: 'The maps below show a river crossing area in 1968 and in the present day, together with plans for future development.',
    instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    mapSpec: {
      title: 'River Crossing Area Development',
      dataVersion: 'map-v2',
      beforeLabel: '1968',
      afterLabel: 'Now and Future',
      panels: [
        {
          id: 'panel-1968',
          title: '1968',
          features: [
            { type: 'river', x: 220, y: 0, width: 105, height: 480, path: 'M220 0 C205 80 235 150 215 240 C200 320 230 400 215 480 L310 480 C325 390 300 310 320 225 C340 140 310 70 325 0 Z' },
            { type: 'road', x: 0, y: 250, width: 220, height: 4, style: 'current' },
            { type: 'ferry', x: 205, y: 240, width: 25, height: 30 },
            { type: 'forest', x: 25, y: 40, width: 150, height: 130, treeCount: 8 },
            { type: 'housing', x: 350, y: 45, rows: 3, columns: 3 }
          ]
        },
        {
          id: 'panel-now-future',
          title: 'Now and Future',
          features: [
            { type: 'river', x: 220, y: 0, width: 105, height: 480, path: 'M220 0 C205 80 235 150 215 240 C200 320 230 400 215 480 L310 480 C325 390 300 310 320 225 C340 140 310 70 325 0 Z' },
            { type: 'road', x: 0, y: 235, width: 520, height: 4, style: 'current' },
            { type: 'bridge', x: 220, y: 228, width: 90, height: 14 },
            { type: 'car_park', x: 25, y: 40, width: 90, height: 70, label: 'Car park' },
            { type: 'car_park', x: 25, y: 135, width: 145, height: 85, label: 'Car park' },
            { type: 'building_row', x: 120, y: 45, rows: 3, columns: 5, units: 5 },
            { type: 'housing', x: 365, y: 45, rows: 3, columns: 3 },
            { type: 'housing', x: 375, y: 270, rows: 2, columns: 3 },
            { type: 'footpath', x: 15, y: 330, path: 'M15 330 C100 350 200 370 350 380 C400 385 450 390 500 390', style: 'future' },
            { type: 'church', x: 335, y: 380, planned: true },
            { type: 'car_park', x: 410, y: 360, width: 95, height: 65, planned: true, label: 'Car park (planned)' }
          ]
        }
      ]
    }
  }
]

export const fallbackTask1Questions: Task1QuestionData[] = [
  ...lineChartQuestions,
  ...barChartQuestions,
  ...pieChartQuestions,
  ...tableQuestions,
  ...mixedChartQuestions,
  ...processQuestions,
  ...mapQuestions
]

export function getFallbackQuestionsByType(chartType: string): Task1QuestionData[] {
  const typeMap: Record<string, string[]> = {
    line_graph: ['line_chart'],
    line_chart: ['line_chart'],
    bar_chart: ['bar_chart'],
    pie_chart: ['pie_chart'],
    table: ['table'],
    mixed_charts: ['mixed_charts'],
    process: ['process'],
    map: ['map'],
    floor_plan: ['map'],
    before_after: ['map'],
    dynamic_chart: ['line_chart'],
    static_comparison: ['bar_chart']
  }

  const matchingTypes = typeMap[chartType] ?? ['line_chart', 'bar_chart', 'pie_chart', 'table', 'mixed_charts']
  return fallbackTask1Questions.filter(q => matchingTypes.includes(q.chartType))
}

export function getRandomFallbackQuestion(chartType: string): Task1QuestionData {
  const candidates = getFallbackQuestionsByType(chartType)
  return candidates[Math.floor(Math.random() * candidates.length)] ?? fallbackTask1Questions[0]
}
