import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--directory', dest='directory', default="C:/Users/Darius/Desktop/iflow2018/iflow2017-sp/pu/src/js", help='directory of the java files', type=str)
parser.add_argument('--allvars', dest='allvars', default=False, help='consider all the variables even the ones defined inside the code', type=bool)
parser.add_argument('--functionvars', dest='functionvars', default=True, help='protext the input variables of the main function', type=bool)
parser.add_argument('--chosen_vars', dest='chosen_vars', default="", help='put the variables that you want to protect with space between them here', type=str)

args = parser.parse_args()

dir=args.directory
import os,sys
only_important_vars=not args.allvars

output=[]
for cur_file in os.listdir(dir):
    if "_augmented" in cur_file:
        os.remove(os.path.join(dir,cur_file))

for cur_file in os.listdir(dir):
    new_file=""
    additionalvars=""
    additionalvars_counter=0
    protedted_vars=set()
    Inside_IF=False
    with open(os.path.join(dir,cur_file)) as f:
        additionalvars+="var S$ = require('S$');\n"
        for line in f.readlines():
            spaces=len(line)-len(line.lstrip(" "))
            if line.strip(" ")[:4]=="var " and (spaces==0 or not only_important_vars):
                line=line.strip(" \n;")[4:]
                for cur_line in line.split(", "):
                    print(cur_line)
                    clean_line=cur_line.strip(" \n;")
                    var_name=clean_line.split("=")[0].strip(" \n;")
                    protedted_vars.add(var_name)
                    if "=" in clean_line:
                        init_value=clean_line.split("=")[1].strip(" ;\n")
                    else:
                        init_value='[true,"1234","random"]'
                    if "." in init_value or "[" in init_value or "]" in init_value or "require" in init_value:
                        init_value = '[true, "1234", "random"]'
                    new_file+="\n{}var {} = S$.symbol(\'{}\',{});\n\n".format(" "*spaces,var_name,var_name,str(init_value))
            elif line.strip(" ")[:9]=="function " and (spaces==0 or not only_important_vars) and args.functionvars:
                for var_s in line[line.find("(")+1:line.rfind(")")].split(","):
                    protedted_vars.add(var_s.strip(", "))
            elif " = " in line:
                var_name=line.split("=")[0].split(".")[0].strip(" ")
                #print(var_name)
                #print(line)
                #print(protedted_vars)
                if var_name in protedted_vars and (args.chosen_vars=="" or var_name in args.chosen_vars):
                    node_name = "con_"+str(var_name)+"_"+str(additionalvars_counter)
                    #print(node_name,line)
                    line.replace("\}","}}").replace("\{","{{")
                    new_file+="{}if ({}){{ \n {} \n{}}}\n".format(" "*spaces,node_name,line," "*spaces)

                    additionalvars +="\nvar {} = S$.symbol(\'{}\',{});\n\n".format(node_name,node_name,"true")
                    additionalvars_counter+=1
                else:
                    new_file += line

            else:
                new_file+=line
    print("file anme:",cur_file)
    print("set of variables",protedted_vars)
    print("protector variables",additionalvars_counter)
    output.append((cur_file,len(protedted_vars),additionalvars_counter))
    with open(os.path.join(dir, cur_file[:-3]+"_augmented.js"),"w") as o:
        o.write(additionalvars+new_file)
for i in output:
    print(i)